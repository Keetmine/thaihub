import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

/** Set of event ids the current user (if any) has favorited, restricted to `eventIds`. */
export async function getFavoritedEventIds(eventIds: string[]): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();

  const user = await getCurrentUser();
  if (!user) return new Set();

  const favorites = await prisma.favoriteEvent.findMany({
    where: { userId: user.id, eventId: { in: eventIds } },
    select: { eventId: true },
  });

  return new Set(favorites.map((f) => f.eventId));
}
