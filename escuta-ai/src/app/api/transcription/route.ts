import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addTranscriptionJob } from "@/lib/queue";
import { v4 as uuidv4 } from "uuid";

// Route segment config (Next.js 16)
export const runtime = "nodejs";
export const maxDuration = 120;

// Desabilita o limite de body padrão do Next.js
export const fetchCache = "force-no-store";

// Limite de 500MB para áudios de até 1 hora
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const ALLOWED_TYPES = [
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/webm",
];

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Verificar quota do usuário
    const quota = await prisma.usageQuota.findUnique({
      where: { userId: session.user.id },
    });

    if (quota) {
      const remaining = quota.monthlyMinutesLimit - quota.usedMinutes;
      if (remaining <= 0) {
        return NextResponse.json(
          { error: "Você atingiu o limite mensal de transcrições" },
          { status: 403 }
        );
      }
    }

    const formData = await request.formData();
    const file = formData.get("audio") as File | null;
    const title = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Validar tamanho
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Arquivo muito grande. Limite de 500MB" },
        { status: 400 }
      );
    }

    // Validar tipo
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato de arquivo não suportado" },
        { status: 400 }
      );
    }

    // Converter arquivo para base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const audioBase64 = buffer.toString("base64");

    // Criar transcrição no banco
    const transcription = await prisma.transcription.create({
      data: {
        userId: session.user.id,
        title: title || `Transcrição ${new Date().toLocaleDateString("pt-BR")}`,
        status: "PENDING",
      },
    });

    // Adicionar job na fila
    const job = await addTranscriptionJob({
      transcriptionId: transcription.id,
      audioBase64,
      filename: file.name || `audio-${uuidv4()}.webm`,
      userId: session.user.id,
    });

    // Armazenar jobId na transcrição para permitir cancelamento
    await prisma.transcription.update({
      where: { id: transcription.id },
      data: { jobId: job.id },
    });

    return NextResponse.json({
      message: "Transcrição iniciada",
      transcriptionId: transcription.id,
    });
  } catch (error) {
    console.error("Erro ao processar upload:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
