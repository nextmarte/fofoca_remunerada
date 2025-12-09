import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import Redis from "ioredis";

// Conexão Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

// Fila BullMQ
const transcriptionQueue = new Queue("transcription", { connection: redis });

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { transcriptionId, llmProvider = "openai" } = await request.json();

    if (!transcriptionId) {
      return NextResponse.json(
        { error: "ID de transcrição é obrigatório" },
        { status: 400 }
      );
    }

    // Buscar transcrição
    const transcription = await prisma.transcription.findUnique({
      where: { id: transcriptionId },
      include: {
        user: true,
        segments: true,
        speakers: true,
      },
    });

    if (!transcription) {
      return NextResponse.json(
        { error: "Transcrição não encontrada" },
        { status: 404 }
      );
    }

    // Verificar se é do usuário logado
    if (transcription.user.email !== session.user.email) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Limpar speakers anteriores
    await prisma.speaker.deleteMany({
      where: { transcriptionId },
    });

    // Adicionar job na fila para reprocessar speakers
    const job = await transcriptionQueue.add(
      "reprocess-speakers",
      {
        transcriptionId,
        segments: transcription.segments.map((seg) => ({
          id: seg.id,
          startTime: seg.startTime,
          endTime: seg.endTime,
          text: seg.text,
          confidence: seg.confidence,
        })),
        language: transcription.language,
        llmProvider,
      },
      {
        priority: 10, // Alta prioridade
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      }
    );

    return NextResponse.json({
      success: true,
      message: "Reprocessamento de speakers iniciado",
      jobId: job.id,
      transcriptionId,
      llmProvider,
    });
  } catch (error) {
    console.error("Erro ao reprocessar speakers:", error);
    return NextResponse.json(
      { error: "Erro ao reprocessar speakers" },
      { status: 500 }
    );
  }
}
