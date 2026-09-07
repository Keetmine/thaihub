import { prisma } from "@/lib/prisma";
import { communityAccess } from "@/lib/communities";

/**
 * Встречи сообществ (АА25, этап 3) — права и потолки.
 *
 * Встреча живёт в той же таблице `Event`, что и афиша: так она бесплатно
 * получает карточку, «я иду», комментарии, карту и календарь. Цена
 * решения — два правила, и оба здесь:
 *
 * 1. **Каталог не должен видеть встречи** — за это отвечает
 *    `catalogEventsWhere()` (src/lib/catalogEvents.ts), который стоит во
 *    всех выборках скопом.
 * 2. **Встречу видят участники** — за это отвечает `canSeeMeetup()`
 *    ниже: за встречей стоит чей-то домашний адрес, и он не уходит ни
 *    гостю, ни поисковику, пока автор сам не открыл встречу всем.
 *
 * Правило доступа держится в одном месте намеренно — как
 * `communityAccess` у самого сообщества: вторая копия тех же условий
 * рано или поздно разъедется с первой, и разъедется молча.
 */

/** Название встречи: «Смотрим 5 серию у Кати» — длиннее заголовка
 *  каталожного события не бывает. */
export const MEETUP_TITLE_MAX = 120;
export const MEETUP_VENUE_MAX = 120;
export const MEETUP_ADDRESS_MAX = 200;
export const MEETUP_DESCRIPTION_MAX = 2000;

export type MeetupRights = {
  /** Принятый участник сообщества — может заводить встречи. */
  isMember: boolean;
  /** Создатель или модератор — может править и удалять ЛЮБУЮ встречу. */
  canManage: boolean;
};

const NO_RIGHTS: MeetupRights = { isMember: false, canManage: false };

/**
 * Права зрителя в сообществе встречи. Ходит в базу, поэтому вызывается
 * один раз на запрос — и в экшенах (проверка на сервере), и на вкладке
 * (что показывать).
 */
export async function communityRights(
  communityId: string,
  viewerId: string | null | undefined,
): Promise<MeetupRights> {
  if (!viewerId) return NO_RIGHTS;
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: {
      ownerId: true,
      visibility: true,
      joinMode: true,
      members: { where: { userId: viewerId }, select: { role: true, status: true } },
    },
  });
  if (!community) return NO_RIGHTS;
  const access = communityAccess(community, viewerId, community.members[0] ?? null);
  return { isMember: access.isMember, canManage: access.canManage };
}

/**
 * Может ли зритель открыть страницу события.
 *
 * Каталожное событие открыто всем — оно и должно быть в поиске. Встречу
 * видят только участники сообщества, и исключений нет (правка владельца
 * 2026-09-08, флаг «показывать всем» отменён): в `venue`/`address` у
 * встречи стоит чей-то домашний адрес.
 */
export async function canSeeMeetup(
  event: { communityId: string | null },
  viewerId: string | null | undefined,
): Promise<boolean> {
  if (!event.communityId) return true;
  const rights = await communityRights(event.communityId, viewerId);
  return rights.isMember;
}

/** Может ли зритель править эту встречу: автор — свою, создатель и
 *  модератор сообщества — любую. */
export function canEditMeetup(
  event: { createdById: string | null },
  viewerId: string | null | undefined,
  rights: MeetupRights,
): boolean {
  if (!viewerId) return false;
  if (rights.canManage) return true;
  return rights.isMember && event.createdById === viewerId;
}
