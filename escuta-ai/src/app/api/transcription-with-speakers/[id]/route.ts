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
        speakers: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!transcription) {
      return NextResponse.json(
        { error: "Transcrição não encontrada" },
        { status: 404 }
      );
    }

    // Formatar speakers para incluir características parseadas
    const formattedSpeakers = transcription.speakers.map((speaker) => ({
      ...speaker,
      characteristics: speaker.characteristics
        ? JSON.parse(speaker.characteristics)
        : {},
    }));

    // Construir transcrição diarizada
    const diarizedTranscript = transcription.segments.map((segment) => {
      const speaker = formattedSpeakers.find(
        (s) => s.speakerId === segment.speakerId
      );
      return {
        ...segment,
        speaker_name: speaker?.name || segment.speakerId || "Unknown",
      };
    });

    return NextResponse.json({
      ...transcription,
      speakers: formattedSpeakers,
      diarized_segments: diarizedTranscript,
    });
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
