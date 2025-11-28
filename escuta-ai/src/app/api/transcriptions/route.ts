import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const transcriptions = await prisma.transcription.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        duration: true,
        language: true,
        wordCount: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json(transcriptions);
  } catch (error) {
    console.error("Erro ao listar transcrições:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
