import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invite = await prisma.invitation.findUnique({
    where: { token },
    select: { email: true, role: true, expiresAt: true, usedAt: true }
  });

  if (!invite) {
    return NextResponse.json({ error: "Convite inválido" }, { status: 404 });
  }

  if (invite.usedAt) {
    return NextResponse.json({ error: "Convite já utilizado" }, { status: 400 });
  }

  if (new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Convite expirado" }, { status: 400 });
  }

  return NextResponse.json(invite);
}
