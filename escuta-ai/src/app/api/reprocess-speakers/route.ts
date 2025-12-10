import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { checkDiarizationQuota, DEFAULT_DIARIZATION_LIMIT_MINUTES } from "@/lib/pyannote";

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

    const { transcriptionId, llmProvider, audioUrl } = await request.json();

    if (!transcriptionId) {
      return NextResponse.json(
        { error: "ID de transcrição é obrigatório" },
        { status: 400 }
      );
    }

    // Buscar transcrição com dados do usuário
    const transcription = await prisma.transcription.findUnique({
      where: { id: transcriptionId },
      include: {
        user: {
          include: {
            usageQuota: true,
          },
        },
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

    const isAdmin = transcription.user.role === "ADMIN";
    
    // Determinar provider:
    // - Admins podem escolher qualquer provider
    // - Usuários comuns usam Pyannote SE tiver audioUrl, senão Nebius como fallback
    let finalProvider: string;
    
    if (isAdmin && llmProvider) {
      finalProvider = llmProvider;
    } else if (audioUrl) {
      finalProvider = "pyannote";
    } else {
      // Fallback para Nebius quando não há URL de áudio para Pyannote
      finalProvider = "nebius";
      console.log(`[API] Usando Nebius como fallback (sem audioUrl para Pyannote)`);
    }

    // Para Pyannote, verificar quota de diarização (apenas para não-admins)
    if (finalProvider === "pyannote" && !isAdmin) {
      const usageQuota = transcription.user.usageQuota;
      const durationMinutes = (transcription.duration || 0) / 60;
      
      const usedMinutes = usageQuota?.usedDiarizationMinutes || 0;
      const limitMinutes = usageQuota?.diarizationMinutesLimit || DEFAULT_DIARIZATION_LIMIT_MINUTES;
      
      const quotaCheck = checkDiarizationQuota(usedMinutes, limitMinutes, durationMinutes);
      
      if (!quotaCheck.allowed) {
        return NextResponse.json(
          { error: quotaCheck.message },
          { status: 403 }
        );
      }
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
        llmProvider: finalProvider,
        audioUrl: finalProvider === "pyannote" ? audioUrl : undefined,
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

    // Atualizar quota de diarização se for Pyannote e não-admin
    if (finalProvider === "pyannote" && !isAdmin && transcription.user.usageQuota) {
      const durationMinutes = (transcription.duration || 0) / 60;
      await prisma.usageQuota.update({
        where: { userId: transcription.user.id },
        data: {
          usedDiarizationMinutes: { increment: durationMinutes },
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Reprocessamento de speakers iniciado",
      jobId: job.id,
      transcriptionId,
      llmProvider: finalProvider,
      isAdmin,
    });
  } catch (error) {
    console.error("Erro ao reprocessar speakers:", error);
    return NextResponse.json(
      { error: "Erro ao reprocessar speakers" },
      { status: 500 }
    );
  }
}
