import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import Redis from "ioredis";
import { analyzeSpeakersWithLLM } from "@/lib/nebius";
import { analyzeSpeakersWithOpenAI } from "@/lib/openai-speakers";

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

interface TranscriptionJobData {
  transcriptionId: string;
  audioBase64: string;
  filename: string;
  userId: string;
}

interface ReprocessSpeakersJobData {
  transcriptionId: string;
  segments: Array<{
    id: string;
    startTime: number;
    endTime: number;
    text: string;
    confidence?: number;
  }>;
  language: string | null;
  llmProvider?: "openai" | "nebius";
}

async function processTranscription(job: Job<TranscriptionJobData>) {
  const { transcriptionId, audioBase64, filename, userId } = job.data;
  const startTime = Date.now();

  console.log(`[Worker] Processando transcrição ${transcriptionId}`);

  try {
    // Atualizar status para PROCESSING
    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: { status: "PROCESSING" },
    });

    // Converter base64 para buffer
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // Detectar tipo MIME baseado na extensão do arquivo
    const getAudioMimeType = (fname: string): string => {
      const ext = fname.toLowerCase().split('.').pop();
      const mimeTypes: Record<string, string> = {
        'mp3': 'audio/mpeg',
        'mp4': 'audio/mp4',
        'm4a': 'audio/mp4',
        'wav': 'audio/wav',
        'webm': 'audio/webm',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac',
      };
      return mimeTypes[ext || ''] || 'audio/mpeg';
    };

    // Manter a extensão original do arquivo
    const safeFilename = filename || `audio-${Date.now()}.m4a`;
    const mimeType = getAudioMimeType(safeFilename);

    // Criar File para a API do OpenAI (usar Blob primeiro para compatibilidade)
    const blob = new Blob([audioBuffer], { type: mimeType });
    const file = new File([blob], safeFilename, { type: mimeType });

    console.log(`[Worker] Enviando arquivo: ${safeFilename}, tamanho: ${audioBuffer.length} bytes, tipo: ${mimeType}`);

    // Chamar API do Whisper
    const response = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    const processingTime = Date.now() - startTime;
    const durationMinutes = (response.duration || 0) / 60;
    const cost = durationMinutes * 0.006; // $0.006 por minuto

    // Criar transcrição com segmentos iniciais
    const createdTranscription = await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        status: "COMPLETED",
        text: response.text,
        language: response.language,
        duration: Math.round(response.duration || 0),
        wordCount: response.text.split(/\s+/).length,
        processingTime,
        cost,
        completedAt: new Date(),
        segments: {
          createMany: {
            data:
              response.segments?.map((seg) => ({
                startTime: seg.start,
                endTime: seg.end,
                text: seg.text,
                confidence: 0.95, // Whisper default confidence
              })) || [],
          },
        },
      },
      include: { segments: true },
    });

    // Analisar speakers se houver mais de um segmento
    if (createdTranscription.segments.length > 0) {
      console.log(
        `[Worker] Analisando speakers para transcrição ${transcriptionId}...`
      );

      try {
        const speakerAnalysis = await analyzeSpeakersWithLLM(
          createdTranscription.segments.map((seg) => ({
            id: seg.id,
            startTime: seg.startTime,
            endTime: seg.endTime,
            text: seg.text,
            confidence: seg.confidence || 0.95,
          })),
          createdTranscription.language || "pt-BR"
        );

        // Criar speakers identificados
        for (const speaker of speakerAnalysis.speakers) {
          await prisma.speaker.create({
            data: {
              transcriptionId: createdTranscription.id,
              speakerId: speaker.id,
              name: speaker.name,
              characteristics: JSON.stringify(speaker.characteristics),
              confidence: speaker.confidence,
            },
          });
        }

        // Atualizar segmentos com speaker_id
        for (const diarizedSegment of speakerAnalysis.diarized_transcript) {
          const segment = createdTranscription.segments.find(
            (s) =>
              Math.abs(s.startTime - diarizedSegment.start_time) < 0.1 &&
              Math.abs(s.endTime - diarizedSegment.end_time) < 0.1
          );

          if (segment) {
            await prisma.transcriptionSegment.update({
              where: { id: segment.id },
              data: { speakerId: diarizedSegment.speaker_id },
            });
          }
        }

        console.log(
          `[Worker] Speakers analisados: ${speakerAnalysis.speakers.length} identificados`
        );
      } catch (speakerError) {
        console.error(
          `[Worker] Erro ao analisar speakers para ${transcriptionId}:`,
          speakerError
        );
        // Continuar mesmo se análise de speakers falhar
      }
    }

    // Atualizar quota do usuário
    await prisma.usageQuota.update({
      where: { userId },
      data: {
        usedMinutes: { increment: durationMinutes },
        totalTranscriptions: { increment: 1 },
      },
    });

    console.log(
      `[Worker] Transcrição ${transcriptionId} concluída em ${processingTime}ms`
    );

    return { success: true, transcriptionId };
  } catch (error) {
    console.error(`[Worker] Erro na transcrição ${transcriptionId}:`, error);

    // Atualizar transcrição com erro
    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Erro desconhecido",
      },
    });

    throw error;
  }
}

// Criar worker
const worker = new Worker<TranscriptionJobData>(
  "transcription",
  processTranscription,
  {
    connection: redis,
    concurrency: 2,
  }
);

// Processar reprocessamento de speakers
async function processReprocessSpeakers(job: Job<ReprocessSpeakersJobData>) {
  const { transcriptionId, segments, language, llmProvider = "openai" } =
    job.data;

  console.log(
    `[Worker] Reprocessando speakers para transcrição ${transcriptionId} usando ${llmProvider}...`
  );

  try {
    // Analisar speakers com LLM escolhido
    console.log(
      "[Worker] Analisando speakers para transcrição " +
        transcriptionId +
        "..."
    );

    const analysisResult =
      llmProvider === "nebius"
        ? await analyzeSpeakersWithLLM(segments, language || "pt-BR")
        : await analyzeSpeakersWithOpenAI(segments, language || "pt-BR");

    // Salvar speakers
    for (const speaker of analysisResult.speakers) {
      await prisma.speaker.create({
        data: {
          transcriptionId,
          speakerId: speaker.id,
          name: speaker.name,
          characteristics: JSON.stringify(speaker.characteristics),
          confidence: speaker.confidence,
        },
      });
    }

    // Salvar speaker assignments nos segmentos
    if (analysisResult.diarized_transcript) {
      for (const diarizedSeg of analysisResult.diarized_transcript) {
        const segmentIndex = segments.findIndex(
          (s) => s.text === diarizedSeg.text
        );
        if (segmentIndex >= 0) {
          await prisma.transcriptionSegment.update({
            where: { id: segments[segmentIndex].id },
            data: {
              speakerId: diarizedSeg.speaker_id,
            },
          });
        }
      }
    }

    console.log(
      "[Worker] Speakers reprocessados: " +
        analysisResult.speakers.length +
        " identificados"
    );
  } catch (error) {
    console.error(
      "[Worker] Erro reprocessando speakers:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

// Registrar handler para reprocessamento
const reprocessWorker = new Worker<ReprocessSpeakersJobData>(
  "transcription",
  async (job: Job) => {
    if (job.name === "reprocess-speakers") {
      return processReprocessSpeakers(job as Job<ReprocessSpeakersJobData>);
    }
    return processTranscription(job as Job<TranscriptionJobData>);
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completado`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} falhou:`, err.message);
});

worker.on("error", (err) => {
  console.error("[Worker] Erro:", err);
});

reprocessWorker.on("completed", (job) => {
  console.log(`[Worker] Job reprocessamento ${job.id} completado`);
});

reprocessWorker.on("failed", (job, err) => {
  console.error(
    `[Worker] Job reprocessamento ${job?.id} falhou:`,
    err.message
  );
});

reprocessWorker.on("error", (err) => {
  console.error("[Worker] Erro reprocessamento:", err);
});

console.log("[Worker] Iniciado e aguardando jobs...");

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Worker] Recebido SIGTERM, encerrando...");
  await worker.close();
  await reprocessWorker.close();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});
