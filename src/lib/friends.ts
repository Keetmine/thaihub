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

/** For each of `eventIds`, the friends (name + photo) who are going. */
export async function getFriendsGoingByEvent(
  eventIds: string[],
  friendIds: string[],
): Promise<Map<string, { id: string; name: string | null; photoUrl: string | null }[]>> {
  const result = new Map<string, { id: string; name: string | null; photoUrl: string | null }[]>();
  if (eventIds.length === 0 || friendIds.length === 0) return result;

  const attendances = await prisma.eventAttendance.findMany({
    where: { eventId: { in: eventIds }, userId: { in: friendIds } },
    select: { eventId: true, user: { select: { id: true, name: true, photoUrl: true } } },
  });

  for (const a of attendances) {
    if (!result.has(a.eventId)) result.set(a.eventId, []);
    result.get(a.eventId)!.push(a.user);
  }

  return result;
}
