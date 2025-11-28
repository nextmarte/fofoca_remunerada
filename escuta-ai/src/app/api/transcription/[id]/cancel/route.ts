import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { transcriptionQueue } from "@/lib/queue";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Verificar se a transcrição existe e pertence ao usuário
    const transcription = await prisma.transcription.findUnique({
      where: { id },
    });

    if (!transcription) {
      return NextResponse.json(
        { error: "Transcrição não encontrada" },
        { status: 404 }
      );
    }

    if (transcription.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Você não tem permissão para cancelar esta transcrição" },
        { status: 403 }
      );
    }

    // Verificar se pode ser cancelada (apenas PENDING ou PROCESSING)
    if (
      transcription.status !== "PENDING" &&
      transcription.status !== "PROCESSING"
    ) {
      return NextResponse.json(
        {
          error: `Não é possível cancelar uma transcrição com status ${transcription.status}`,
        },
        { status: 400 }
      );
    }

    // Remover o job da fila se ainda estiver lá
    if (transcription.jobId) {
      try {
        const job = await transcriptionQueue.getJob(transcription.jobId);
        if (job) {
          await job.remove();
        }
      } catch (error) {
        console.error(`Erro ao remover job ${transcription.jobId}:`, error);
        // Continuar mesmo se falhar remover o job
      }
    }

    // Atualizar status para CANCELLED
    const updated = await prisma.transcription.update({
      where: { id },
      data: {
        status: "CANCELLED",
        errorMessage: "Cancelado pelo usuário",
      },
    });

    return NextResponse.json({
      message: "Transcrição cancelada com sucesso",
      transcription: updated,
    });
  } catch (error) {
    console.error("Erro ao cancelar transcrição:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
