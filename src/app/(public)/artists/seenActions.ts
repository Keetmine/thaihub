"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

// Ручная отметка «видела этого исполнителя вживую». Автоматически
// считаются только события из нашей афиши с отметкой «я ходил(а)» —
// концерты до регистрации и встречи вне афиши иначе не попадали в
// статистику (см. features/gamification.md).

export async function toggleSeenLive(performerId: string): Promise<{ seen: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await prisma.performerSeen.findUnique({
    where: { userId_performerId: { userId: user.id, performerId } },
  });

  if (existing) {
    await prisma.performerSeen.delete({ where: { id: existing.id } });
  } else {
    await prisma.performerSeen.create({ data: { userId: user.id, performerId } });
  }

  revalidatePath("/account");
  return { seen: !existing };
}
