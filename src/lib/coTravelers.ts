import { prisma } from "@/lib/prisma";

/** Id со-путешественников: все, с кем юзер состоит в одной совместной
 *  поездке (владелец или ACCEPTED-участник с обеих сторон). Для
 *  TRIP-видимости заметок к событиям. */
export async function getCoTravelerIds(userId: string): Promise<string[]> {
  const trips = await prisma.trip.findMany({
    where: {
      OR: [
        { userId },
        { members: { some: { userId, status: "ACCEPTED" } } },
      ],
    },
    select: {
      userId: true,
      members: { where: { status: "ACCEPTED" }, select: { userId: true } },
    },
  });
  const ids = new Set<string>();
  for (const t of trips) {
    ids.add(t.userId);
    t.members.forEach((m) => ids.add(m.userId));
  }
  ids.delete(userId);
  return Array.from(ids);
}
