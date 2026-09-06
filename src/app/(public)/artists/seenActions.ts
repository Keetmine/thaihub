"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { autoSeenLive } from "@/lib/userStats";

// Глазик «видела вживую» на странице артиста показывает ИТОГОВОЕ
// состояние: автоматику (артисты посещённых событий афиши и личных
// событий поездок) плюс ручное решение поверх неё. Строка PerformerSeen
// и есть это решение — она нужна, только когда человек спорит с
// автоматикой: отмечает концерт до регистрации на сайте (seen=true) или
// снимает одного из состава события (seen=false, «на концерте пятеро, а
// разглядела двоих»). Совпал с автоматикой — строка удаляется, и глазик
// снова следует за событиями. Отметку «иду» на самом событии это не
// трогает: артист уходит из «видела вживую», событие остаётся
// посещённым (см. docs/features/gamification.md).

export async function toggleSeenLive(performerId: string): Promise<{ seen: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [auto, existing] = await Promise.all([
    autoSeenLive(user.id, performerId),
    prisma.performerSeen.findUnique({
      where: { userId_performerId: { userId: user.id, performerId } },
      select: { id: true, seen: true },
    }),
  ]);

  const current = existing ? existing.seen : auto;
  const next = !current;

  if (next === auto) {
    // Решение совпало с автоматикой — перекрывать нечего.
    if (existing) await prisma.performerSeen.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.performerSeen.update({ where: { id: existing.id }, data: { seen: next } });
  } else {
    await prisma.performerSeen.create({
      data: { userId: user.id, performerId, seen: next },
    });
  }

  revalidatePath("/account");
  return { seen: next };
}
