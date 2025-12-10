import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const invites = await prisma.invitation.findMany({
    include: {
      createdByUser: {
        select: { name: true, email: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json(invites);
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    console.log("Session in POST /api/admin/invites:", JSON.stringify(session, null, 2));

    if (session?.user?.role !== "ADMIN") {
      console.log("User is not ADMIN");
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const { email, role } = await request.json();
    console.log("Creating invite for:", email, role);
    
    // Token generation
    const token = uuidv4();
    
    // Expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    if (!session.user.id) {
        console.error("User ID missing in session");
        return NextResponse.json({ error: "User ID missing" }, { status: 500 });
    }

    // Verify user exists in DB
    const userExists = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!userExists) {
        console.error(`User ${session.user.id} not found in DB`);
        return NextResponse.json({ error: "User record not found" }, { status: 500 });
    }

    const invite = await prisma.invitation.create({
      data: {
        email: email || null,
        role: role || "USER",
        token,
        expiresAt,
        createdByUserId: session.user.id,
      }
    });
    
    console.log("Invite created:", invite);

    return NextResponse.json(invite);
  } catch (error) {
    console.error("Error creating invite:", error);
    return NextResponse.json({ error: `Internal Server Error: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
