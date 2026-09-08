import { prisma } from "@/lib/prisma";
import type { DramaWatchStatusValue } from "@/app/(public)/favorites/actions";

/** Что пользователь отметил у каждого из `dramaIds`: статус, на какой
 *  серии остановился и свою оценку (АА2), если ставил. */
export type DramaWatchEntry = {
  status: DramaWatchStatusValue;
  episodesWatched: number | null;
  rating: number | null;
};

export async function getDramaWatchStatuses(
  dramaIds: string[],
  userId: string | null | undefined,
): Promise<Map<string, DramaWatchEntry>> {
  if (dramaIds.length === 0 || !userId) return new Map();

  const statuses = await prisma.dramaWatchStatus.findMany({
    where: { userId, dramaId: { in: dramaIds } },
    select: { dramaId: true, status: true, episodesWatched: true, rating: true },
  });

  return new Map(
    statuses.map((s) => [
      s.dramaId,
      { status: s.status, episodesWatched: s.episodesWatched, rating: s.rating },
    ]),
  );
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

/** Один человек из сообщества зрителя, отметивший «иду». `community` —
 *  то сообщество, через которое зритель с ним и знаком: без него плашка
 *  отвечает «идёт какой-то Дима», а не «идёт Дима из „Лакорнов“». */
export type CommunityPeerGoing = {
  id: string;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
  community: { id: string; slug: string | null; title: string } | null;
};

/**
 * «Кто из вашего сообщества идёт» (АА25, связка сообществ с афишей).
 *
 * Живёт рядом с остальными выборками «иду» намеренно: это тот же вопрос
 * к `EventAttendance`, только круг людей другой — не друзья, а те, с кем
 * зритель состоит в одном сообществе. Ради этого блок и делался: на
 * концерт человек идёт не к абстрактным незнакомцам, а к своим.
 *
 * По СОБЫТИЮ, а не по дате: страница события показывает все свои даты
 * разом, и здесь нужен ответ «кто вообще из своих там будет» — ровно
 * как у блока друзей выше (`getFriendsGoingByOccurrence` из
 * `lib/friends.ts` отвечает на другой вопрос, для карточек конкретного
 * дня в списках).
 *
 * Приватность — вся в запросе, а не в разметке:
 * - `viewerId` без сообществ или гость получают пустой список, то есть
 *   блока у них нет вовсе;
 * - оба конца связи — `status: "ACTIVE"`: ни заявка, ни убранный (BANNED)
 *   участником не считаются нигде;
 * - `hideProfileActivity` — мастер-выключатель приватности профиля
 *   (см. `users/[id]/page.tsx`): закрывшийся видит своё «иду» сам, но
 *   соседям по сообществу оно не показывается. Друзьям он был бы виден,
 *   но друзья и так живут в своём блоке — и приходят сюда в
 *   `excludeUserIds`, чтобы одно лицо не стояло на странице дважды;
 * - удалённые аккаунты (`deletedAt`) не показываются нигде.
 */
export async function getCommunityPeersGoing(
  eventId: string,
  viewerId: string | null | undefined,
  excludeUserIds: string[] = [],
): Promise<CommunityPeerGoing[]> {
  if (!viewerId) return [];

  const mine = await prisma.communityMember.findMany({
    where: { userId: viewerId, status: "ACTIVE" },
    select: { communityId: true },
  });
  if (mine.length === 0) return [];
  const communityIds = mine.map((m) => m.communityId);

  const attendances = await prisma.eventAttendance.findMany({
    where: {
      eventId,
      // Себя и уже показанных друзей отсекаем здесь же: список в
      // разметке потом только раскладывается по плашкам.
      userId: { notIn: [viewerId, ...excludeUserIds] },
      user: {
        deletedAt: null,
        hideProfileActivity: false,
        communityMemberships: {
          some: { communityId: { in: communityIds }, status: "ACTIVE" },
        },
      },
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          photoUrl: true,
          // Одно общее сообщество на подпись — самое раннее из общих.
          // Их может быть несколько, но плашке хватает одного: она
          // объясняет знакомство, а не перечисляет связи.
          communityMemberships: {
            where: { communityId: { in: communityIds }, status: "ACTIVE" },
            select: { community: { select: { id: true, slug: true, title: true } } },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  // «Иду» стоит на КАЖДОЙ выбранной дате — у идущего на все три дня
  // строк три, а в блоке человек должен быть один (как у друзей).
  return Array.from(
    new Map(
      attendances.map(({ user }) => [
        user.id,
        {
          id: user.id,
          name: user.name,
          username: user.username,
          photoUrl: user.photoUrl,
          community: user.communityMemberships[0]?.community ?? null,
        },
      ]),
    ).values(),
  );
}
