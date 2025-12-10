"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateUserQuota(userId: string, newLimit: number) {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  await prisma.usageQuota.upsert({
    where: { userId },
    create: {
      userId,
      monthlyMinutesLimit: newLimit,
    },
    update: {
      monthlyMinutesLimit: newLimit,
    },
  });

  revalidatePath("/admin/users");
}
