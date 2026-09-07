import type { CommunityVisibility, Prisma, TripVisibility } from "@/generated/prisma/client";
import { viewerCommunitiesWhere } from "@/lib/communities";

/**
 * Кто видит СПИСОК МЕСТ СООБЩЕСТВА — одно правило на весь проект.
 *
 * Наружу список сообщества выходит ровно в одном случае: **он сам
 * публичный И сообщество публичное**. У закрытого сообщества наружу не
 * уходит ничего — даже помеченное `PUBLIC`: закрытое прячется именно
 * затем, чтобы о нём не узнавали со стороны, и утечь через список мест
 * оно не должно. `FRIENDS` наружу не открывает никого: дружба — про
 * человека, а список принадлежит сообществу.
 *
 * Правило записано здесь ДВАЖДЫ, и это не описка: страница списка
 * решает про один уже прочитанный список (`canSeeCommunityList`), а
 * каталог мест отбирает списки выборкой (`visibleCommunityListsWhere`)
 * — фильтровать в разметке нельзя, скрытое стилями всё равно уехало бы
 * в HTML. Обе формы лежат в одном файле друг под другом намеренно: пока
 * они рядом, их правят вместе, а разъехавшиеся копии одного правила
 * приватности молча показывают чужое (то же соображение, что у
 * `catalogEventsWhere`/`viewerMeetupsWhere` в `src/lib/catalogEvents.ts`).
 *
 * «Участник» в обеих формах — одно и то же `viewerCommunitiesWhere`
 * (`status = ACTIVE`), которым отбирается всё содержимое сообществ.
 */

/** Списки сообществ, доступные зрителю, — для выборок (`where`). */
export function visibleCommunityListsWhere(
  viewerId: string | null | undefined,
): Prisma.PlaceListWhereInput {
  return {
    communityId: { not: null },
    OR: [
      // Участнику — все списки его сообществ, включая закрытые.
      { community: viewerCommunitiesWhere(viewerId) },
      // Всем остальным (и гостю) — публичный список публичного
      // сообщества, и больше ничего.
      { visibility: "PUBLIC", community: { visibility: "PUBLIC" } },
    ],
  };
}

/**
 * То же правило про один уже прочитанный список: страница `/lists/[id]`
 * знает права зрителя из `communityRights` и спрашивает только про
 * видимость.
 */
export function canSeeCommunityList(
  list: { visibility: TripVisibility },
  community: { visibility: CommunityVisibility },
  isMember: boolean,
): boolean {
  if (isMember) return true;
  return list.visibility === "PUBLIC" && community.visibility === "PUBLIC";
}
