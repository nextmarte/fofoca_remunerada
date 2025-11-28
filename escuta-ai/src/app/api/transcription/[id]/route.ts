import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const transcription = await prisma.transcription.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        segments: {
          orderBy: { startTime: "asc" },
        },
      },
    });

    if (!transcription) {
      return NextResponse.json(
        { error: "Transcrição não encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(transcription);
  } catch (error) {
    console.error("Erro ao buscar transcrição:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const transcription = await prisma.transcription.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!transcription) {
      return NextResponse.json(
        { error: "Transcrição não encontrada" },
        { status: 404 }
      );
    }

    await prisma.transcription.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Transcrição excluída" });
  } catch (error) {
    console.error("Erro ao excluir transcrição:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
