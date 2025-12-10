
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "nextmetal@gmail.com" },
  });
  console.log("User:", user);

  if (user) {
      try {
        const invite = await prisma.invitation.create({
            data: {
                token: "test-token-" + Date.now(),
                expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
                createdByUserId: user.id,
                role: "USER"
            }
        });
        console.log("Invite created successfully:", invite);
        
        // Clean up
        await prisma.invitation.delete({ where: { id: invite.id } });
        console.log("Invite deleted.");
      } catch (e) {
          console.error("Error creating invite:", e);
      }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
