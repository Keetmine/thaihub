import { prisma } from "@/lib/prisma";

/** Ids of `userId`'s accepted friends (either side of the friendship row). */
export async function getFriendIds(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });

  return friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
}

/** Для каждой ДАТЫ (occurrenceId) — друзья, идущие именно на неё:
 *  отметка «иду» теперь per-дата, и индикатор на карточке конкретного
 *  дня показывает только тех, кто идёт в этот день. */
export async function getFriendsGoingByOccurrence(
  occurrenceIds: string[],
  friendIds: string[],
): Promise<Map<string, { id: string; name: string | null; photoUrl: string | null }[]>> {
  const result = new Map<string, { id: string; name: string | null; photoUrl: string | null }[]>();
  if (occurrenceIds.length === 0 || friendIds.length === 0) return result;

  const attendances = await prisma.eventAttendance.findMany({
    where: { occurrenceId: { in: occurrenceIds }, userId: { in: friendIds } },
    select: { occurrenceId: true, user: { select: { id: true, name: true, photoUrl: true } } },
  });

  for (const a of attendances) {
    if (!result.has(a.occurrenceId)) result.set(a.occurrenceId, []);
    result.get(a.occurrenceId)!.push(a.user);
  }

  return result;
}
