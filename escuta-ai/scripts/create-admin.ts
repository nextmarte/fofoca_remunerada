import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Por favor forneça um email como argumento.');
    console.error('Exemplo: npx tsx scripts/create-admin.ts usuario@exemplo.com');
    process.exit(1);
  }

  try {
    const user = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
    });
    console.log(`Sucesso! Usuário ${user.email} agora é um ADMIN.`);
  } catch (error) {
    console.error('Erro ao atualizar usuário. Verifique se o email existe.');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
