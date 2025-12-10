import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import Redis from "ioredis";
import { analyzeSpeakersWithLLM } from "@/lib/nebius";
import { analyzeSpeakersWithOpenAI } from "@/lib/openai-speakers";
import { analyzeSpeakersWithPyannote, checkDiarizationQuota } from "@/lib/pyannote";
import { chunkAudioFile, checkFFmpegAvailable } from "@/lib/audio-chunker";
import { transcribeWithSpeakers, convertToInternalFormat } from "@/lib/whisper-diarization";

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
  llmProvider?: "openai" | "nebius" | "pyannote";
  audioUrl?: string; // URL pública do áudio para Pyannote
}

async function processTranscription(job: Job<TranscriptionJobData>) {
  const { transcriptionId, audioBase64, filename, userId } = job.data;
  
  if (!audioBase64) {
    throw new Error(`audioBase64 is missing for transcription job ${transcriptionId}`);
  }

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

    console.log(`[Worker] Enviando arquivo: ${safeFilename}, tamanho: ${audioBuffer.length} bytes, tipo: ${mimeType}`);

    const audioSizeMB = audioBuffer.length / 1024 / 1024;
    console.log(`[Worker] Tamanho do áudio: ${audioSizeMB.toFixed(2)}MB`);

    interface TranscriptionSegment {
      id?: string;
      text: string;
      startTime: number;
      endTime: number;
      confidence?: number;
    }
    interface SpeakerData {
      speakerId: string;
      name: string | null;
      segmentCount?: number;
      totalDuration?: number;
    }
    let allSegments: TranscriptionSegment[] = [];
    let totalDuration = 0;
    let transcriptionText = "";
    let speakers: SpeakerData[] = [];
    let useWhisperDiarization = true;

    // Tentar usar API Whisper+Diarization primeiro (suporta até 500MB)
    try {
      console.log("[Worker] Usando API Whisper+Diarization...");
      
      const diarizationResult = await transcribeWithSpeakers({
        file: audioBuffer,
        filename: safeFilename,
        language: "pt",
        model: "medium",
        min_speakers: 2,
        max_speakers: 2,
      });

      const converted = convertToInternalFormat(diarizationResult);
      
      allSegments = converted.segments;
      transcriptionText = converted.text;
      totalDuration = converted.duration;
      speakers = converted.speakers;

      console.log(`[Worker] Sucesso! ${allSegments.length} segmentos, ${speakers.length} speakers`);
      
    } catch (whisperError) {
      console.error("[Worker] Erro na API Whisper+Diarization:", whisperError);
      console.log("[Worker] Fallback: Usando OpenAI Whisper...");
      
      useWhisperDiarization = false;

      // Fallback para OpenAI Whisper
      // Se o áudio for maior que 20MB, dividir em chunks
      if (audioSizeMB > 20) {
      console.log("[Worker] Áudio muito grande, verificando FFmpeg...");
      
      const ffmpegAvailable = await checkFFmpegAvailable();
      if (!ffmpegAvailable) {
        throw new Error("FFmpeg não está instalado. Necessário para processar áudios grandes.");
      }

      console.log("[Worker] FFmpeg disponível, dividindo áudio...");
      const chunks = await chunkAudioFile(audioBuffer, safeFilename, 600); // 10 minutos por chunk
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`[Worker] Transcrevendo chunk ${i + 1}/${chunks.length}...`);

        const chunkFile = new File(
          [new Uint8Array(chunk.buffer)],
          `${safeFilename}_chunk_${i}.mp3`,
          { type: "audio/mpeg" }
        );

        const chunkResponse = await openai.audio.transcriptions.create({
          file: chunkFile,
          model: "whisper-1",
          language: "pt",
          response_format: "verbose_json",
          timestamp_granularities: ["segment"],
        });

        // Ajustar timestamps dos segmentos do chunk
        const adjustedSegments = chunkResponse.segments?.map((seg) => ({
          text: seg.text,
          startTime: seg.start + chunk.startTime,
          endTime: seg.end + chunk.startTime,
          confidence: seg.no_speech_prob ? 1 - seg.no_speech_prob : undefined,
        })) || [];

        allSegments.push(...adjustedSegments);
        transcriptionText += (transcriptionText ? " " : "") + chunkResponse.text;
        totalDuration = Math.max(totalDuration, chunk.endTime);
      }

      console.log(`[Worker] Chunks processados. Total de segmentos: ${allSegments.length}`);
    } else {
      // Áudio pequeno, processar normalmente
      const blob = new Blob([audioBuffer], { type: mimeType });
      const file = new File([blob], safeFilename, { type: mimeType });

      const response = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
        language: "pt",
      });

        allSegments = response.segments?.map(seg => ({
          text: seg.text,
          startTime: seg.start,
          endTime: seg.end,
          confidence: seg.no_speech_prob ? 1 - seg.no_speech_prob : undefined
        })) || [];
        transcriptionText = response.text;
        totalDuration = response.duration || 0;
      }
    } // Fim do try-catch do fallback

    const processingTime = Date.now() - startTime;
    const durationMinutes = totalDuration / 60;
    const cost = useWhisperDiarization ? 0 : durationMinutes * 0.006; // Sem custo se usar API própria

    // Criar transcrição com segmentos e speakers
    const createdTranscription = await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        status: "COMPLETED",
        text: transcriptionText,
        language: "pt",
        duration: Math.round(totalDuration),
        wordCount: transcriptionText.split(/\s+/).length,
        processingTime,
        cost,
        completedAt: new Date(),
        segments: {
          createMany: {
            data: allSegments.map((seg) => ({
              startTime: seg.startTime,
              endTime: seg.endTime,
              text: seg.text,
              confidence: seg.confidence || 0.95,
              speakerId: null,
            })),
          },
        },
        // Se já temos speakers da API, criar agora
        ...(speakers.length > 0 && {
          speakers: {
            createMany: {
              data: speakers.map((speaker) => ({
                speakerId: speaker.speakerId,
                name: speaker.name,
              })),
            },
          },
        }),
      },
      include: { segments: true, speakers: true },
    });

    // Analisar speakers apenas se não vieram da API (fallback para OpenAI)
    if (!useWhisperDiarization && createdTranscription.segments.length > 0) {
      console.log(
        `[Worker] Analisando speakers para transcrição ${transcriptionId} (via LLM)...`
      );

      try {
        // Ordenar segmentos por tempo para garantir consistência
        const sortedSegments = [...createdTranscription.segments].sort(
          (a, b) => a.startTime - b.startTime
        );

        // Verificar usuário e quota
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { usageQuota: true },
        });

        const isUserAdmin = user?.role === "ADMIN";
        let speakerAnalysis;

        // Verificar quota para não-admins
        if (!isUserAdmin) {
           const quota = user?.usageQuota;
           const limit = quota?.diarizationMinutesLimit || 90;
           const used = quota?.usedDiarizationMinutes || 0;
           const check = checkDiarizationQuota(used, limit, durationMinutes);
           
           if (!check.allowed) {
             console.warn(`[Worker] Quota de diarização excedida para usuário ${userId}. ${check.message}`);
             // Pular diarização se quota excedida
             // Não lançamos erro para não falhar a transcrição, apenas não identificamos speakers
           } else {
             // Tentar Pyannote se quota permitir
             try {
                speakerAnalysis = await analyzeSpeakersWithPyannote(
                    audioBuffer,
                    transcriptionId,
                    sortedSegments.map((seg) => ({
                        id: seg.id,
                        startTime: seg.startTime,
                        endTime: seg.endTime,
                        text: seg.text,
                        confidence: seg.confidence || 0.95,
                    }))
                );

                // Atualizar uso da quota
                await prisma.usageQuota.update({
                    where: { userId },
                    data: { usedDiarizationMinutes: { increment: durationMinutes } }
                });
             } catch (err) {
                console.error(`[Worker] Erro no Pyannote para usuário ${userId}:`, err);
                // Não fazemos fallback para LLM para usuários comuns (requisito: "usuario so usam pyannotate")
             }
           }
        } else {
            // Admin: Tentar Pyannote, fallback para LLM
            try {
                speakerAnalysis = await analyzeSpeakersWithPyannote(
                    audioBuffer,
                    transcriptionId,
                    sortedSegments.map((seg) => ({
                        id: seg.id,
                        startTime: seg.startTime,
                        endTime: seg.endTime,
                        text: seg.text,
                        confidence: seg.confidence || 0.95,
                    }))
                );
            } catch (err) {
                console.error(`[Worker] Erro no Pyannote (Admin), tentando fallback LLM:`, err);
                speakerAnalysis = await analyzeSpeakersWithLLM(
                    sortedSegments.map((seg) => ({
                        id: seg.id,
                        startTime: seg.startTime,
                        endTime: seg.endTime,
                        text: seg.text,
                        confidence: seg.confidence || 0.95,
                    })),
                    createdTranscription.language || "pt-BR"
                );
            }
        }

        if (speakerAnalysis) {
            // Criar speakers identificados
            for (const speaker of speakerAnalysis.speakers) {
              await prisma.speaker.create({
                data: {
                  transcriptionId: createdTranscription.id,
                  speakerId: speaker.id,
                  name: speaker.name,
                  characteristics: speaker.characteristics ? JSON.stringify(speaker.characteristics) : null,
                  confidence: speaker.confidence,
                },
              });
            }

            // Atualizar segmentos com speaker_id
            let segmentsUpdated = 0;
            let segmentsSkipped = 0;
            
            for (const diarizedSegment of speakerAnalysis.diarized_transcript) {
              if (!diarizedSegment.segmentId) {
                console.warn(
                  `[Worker] Segmento sem ID encontrado, pulando atualização. Speaker: ${diarizedSegment.speaker_id}`
                );
                segmentsSkipped++;
                continue;
              }
              
              if (!diarizedSegment.speaker_id) {
                console.warn(
                  `[Worker] Segmento ${diarizedSegment.segmentId} sem speaker_id atribuído`
                );
              }
              
              await prisma.transcriptionSegment.update({
                where: { id: diarizedSegment.segmentId },
                data: { speakerId: diarizedSegment.speaker_id },
              });
              segmentsUpdated++;
            }

            console.log(
              `[Worker] Speakers analisados: ${speakerAnalysis.speakers.length} identificados, ` +
              `${segmentsUpdated} segmentos atualizados, ${segmentsSkipped} pulados`
            );
        }
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

// Processar reprocessamento de speakers
async function processReprocessSpeakers(job: Job<ReprocessSpeakersJobData>) {
  const { transcriptionId, segments, language, llmProvider = "pyannote", audioUrl } =
    job.data;

  console.log(
    `[Worker] Reprocessando speakers para transcrição ${transcriptionId} usando ${llmProvider}...`
  );

  try {
    // Analisar speakers com provider escolhido
    console.log(
      "[Worker] Analisando speakers para transcrição " +
        transcriptionId +
        "..."
    );

    let analysisResult;
    
    if (llmProvider === "pyannote") {
      if (!audioUrl) {
        console.warn("[Worker] URL do áudio não disponível para Pyannote. Usando Nebius como fallback.");
        analysisResult = await analyzeSpeakersWithLLM(segments, language || "pt-BR");
      } else {
        try {
            // Baixar áudio da URL
            const response = await fetch(audioUrl);
            if (!response.ok) throw new Error(`Falha ao baixar áudio: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuffer);

            analysisResult = await analyzeSpeakersWithPyannote(
                audioBuffer, 
                transcriptionId, 
                segments
            );
        } catch (err) {
            console.error("[Worker] Erro ao baixar/processar áudio para Pyannote:", err);
            console.warn("[Worker] Fallback para Nebius.");
            analysisResult = await analyzeSpeakersWithLLM(segments, language || "pt-BR");
        }
      }
    } else if (llmProvider === "nebius") {
      analysisResult = await analyzeSpeakersWithLLM(segments, language || "pt-BR");
    } else {
      analysisResult = await analyzeSpeakersWithOpenAI(segments, language || "pt-BR");
    }

    // Salvar speakers
    for (const speaker of analysisResult.speakers) {
      await prisma.speaker.create({
        data: {
          transcriptionId,
          speakerId: speaker.id,
          name: speaker.name,
          characteristics: speaker.characteristics ? JSON.stringify(speaker.characteristics) : null,
          confidence: speaker.confidence,
        },
      });
    }

    // Salvar speaker assignments nos segmentos
    if (analysisResult.diarized_transcript) {
      for (const diarizedSeg of analysisResult.diarized_transcript) {
        if (diarizedSeg.segmentId) {
          await prisma.transcriptionSegment.update({
            where: { id: diarizedSeg.segmentId },
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

// Criar worker unificado
const worker = new Worker(
  "transcription",
  async (job: Job) => {
    if (job.name === "reprocess-speakers") {
      return processReprocessSpeakers(job as Job<ReprocessSpeakersJobData>);
    }
    // Default to transcription for "transcribe" or legacy jobs
    return processTranscription(job as Job<TranscriptionJobData>);
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} (${job.name}) completado`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} (${job?.name}) falhou:`, err.message);
});

worker.on("error", (err) => {
  console.error("[Worker] Erro:", err);
});

console.log("[Worker] Iniciado e aguardando jobs...");

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Worker] Recebido SIGTERM, encerrando...");
  await worker.close();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});
