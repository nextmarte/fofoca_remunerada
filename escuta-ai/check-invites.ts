import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkInvites() {
  const invites = await prisma.invitation.findMany();
  console.log("Invites in DB:", invites);
}

checkInvites()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
