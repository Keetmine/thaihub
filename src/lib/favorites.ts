import { prisma } from "@/lib/prisma";
import type { DramaWatchStatusValue } from "@/app/(public)/favorites/actions";

/** Map of dramaId -> the signed-in user's watch status, restricted to `dramaIds`. */
export async function getDramaWatchStatuses(
  dramaIds: string[],
  userId: string | null | undefined,
): Promise<Map<string, DramaWatchStatusValue>> {
  if (dramaIds.length === 0 || !userId) return new Map();

  const statuses = await prisma.dramaWatchStatus.findMany({
    where: { userId, dramaId: { in: dramaIds } },
    select: { dramaId: true, status: true },
  });

  return new Map(statuses.map((s) => [s.dramaId, s.status]));
}

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

/** Set of occurrence ids `userId` is attending — «иду» теперь на
 *  конкретную дату, и карточки списков подсвечиваются именно по ней. */
export async function getGoingOccurrenceIds(
  occurrenceIds: string[],
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (occurrenceIds.length === 0 || !userId) return new Set();

  const attendances = await prisma.eventAttendance.findMany({
    where: { userId, occurrenceId: { in: occurrenceIds } },
    select: { occurrenceId: true },
  });

  return new Set(attendances.map((a) => a.occurrenceId));
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
