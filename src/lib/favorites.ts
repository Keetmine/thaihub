import { prisma } from "@/lib/prisma";

/** Set of event ids `userId` has favorited, restricted to `eventIds`. */
export async function getFavoritedEventIds(
  eventIds: string[],
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (eventIds.length === 0 || !userId) return new Set();

  const favorites = await prisma.favoriteEvent.findMany({
    where: { userId, eventId: { in: eventIds } },
    select: { eventId: true },
  });

  return new Set(favorites.map((f) => f.eventId));
}

/** Set of event ids `userId` is marked as attending ("Я пойду"), restricted to `eventIds`. */
export async function getGoingEventIds(
  eventIds: string[],
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (eventIds.length === 0 || !userId) return new Set();

  const attendances = await prisma.eventAttendance.findMany({
    where: { userId, eventId: { in: eventIds } },
    select: { eventId: true },
  });

  return new Set(attendances.map((a) => a.eventId));
}
