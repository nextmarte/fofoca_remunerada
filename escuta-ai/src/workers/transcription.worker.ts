import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import Redis from "ioredis";

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

    // Garantir que o filename tenha extensão .webm
    const safeFilename = filename.endsWith(".webm") ? filename : `${filename}.webm`;

    // Criar File para a API do OpenAI (usar Blob primeiro para compatibilidade)
    const blob = new Blob([audioBuffer], { type: "audio/webm" });
    const file = new File([blob], safeFilename, { type: "audio/webm" });

    console.log(`[Worker] Enviando arquivo: ${safeFilename}, tamanho: ${audioBuffer.length} bytes`);

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

    // Atualizar transcrição com resultado
    await prisma.transcription.update({
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
              })) || [],
          },
        },
      },
    });

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

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completado`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} falhou:`, err.message);
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
