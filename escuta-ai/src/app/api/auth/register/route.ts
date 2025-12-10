import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  token: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const { name, email, password, token } = parsed.data;
    let role: "USER" | "ADMIN" = "USER";
    let inviteId: string | null = null;

    // Validar token se fornecido
    if (token) {
      const invite = await prisma.invitation.findUnique({
        where: { token },
      });

      if (!invite) {
        return NextResponse.json({ error: "Convite inválido" }, { status: 400 });
      }
      if (invite.usedAt) {
        return NextResponse.json({ error: "Convite já utilizado" }, { status: 400 });
      }
      if (new Date(invite.expiresAt) < new Date()) {
        return NextResponse.json({ error: "Convite expirado" }, { status: 400 });
      }
      if (invite.email && invite.email !== email) {
        return NextResponse.json({ error: "Este convite é para outro email" }, { status: 400 });
      }

      role = invite.role;
      inviteId = invite.id;
    }

    // Verificar se usuário já existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Este email já está cadastrado" },
        { status: 400 }
      );
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 12);

    // Criar usuário
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        // Criar quota inicial de 2 horas (120 minutos)
        usageQuota: {
          create: {
            monthlyMinutesLimit: 120,
            usedMinutes: 0,
            totalTranscriptions: 0,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Marcar convite como usado
    if (inviteId) {
      await prisma.invitation.update({
        where: { id: inviteId },
        data: { usedAt: new Date() }
      });
    }

    return NextResponse.json(
      { message: "Usuário criado com sucesso", user },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao registrar usuário:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
