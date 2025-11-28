import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    let quota = await prisma.usageQuota.findUnique({
      where: { userId: session.user.id },
    });

    // Se não existir, criar quota padrão
    if (!quota) {
      quota = await prisma.usageQuota.create({
        data: {
          userId: session.user.id,
          monthlyMinutesLimit: 120,
          usedMinutes: 0,
          totalTranscriptions: 0,
        },
      });
    }

    // Verificar se precisa resetar (primeiro dia do mês)
    const now = new Date();
    const lastReset = new Date(quota.lastResetAt);
    
    if (
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()
    ) {
      quota = await prisma.usageQuota.update({
        where: { userId: session.user.id },
        data: {
          usedMinutes: 0,
          lastResetAt: now,
        },
      });
    }

    return NextResponse.json({
      limit: quota.monthlyMinutesLimit,
      used: quota.usedMinutes,
      remaining: quota.monthlyMinutesLimit - quota.usedMinutes,
      totalTranscriptions: quota.totalTranscriptions,
      resetDate: new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1
      ).toISOString(),
    });
  } catch (error) {
    console.error("Erro ao buscar quota:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
