import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'marcusantonio@id.uff.br';
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (user) {
    console.log(`User found: ${user.email}`);
    console.log(`Role: ${user.role}`);
  } else {
    console.log(`User not found: ${email}`);
  }
  
  const allUsers = await prisma.user.findMany();
  console.log('All users:', allUsers.map(u => `${u.email} (${u.role})`));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
