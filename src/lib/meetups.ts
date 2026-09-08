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
/** Адрес встречи. 200, а не прежние 120: поле теперь одно на «Где» и
 *  «Адрес» (правка владельца 2026-09-09), и в него влезает вся строка
 *  целиком — «У Кати дома, Ленина 12, кв. 5». Колонка `address`
 *  осталась в базе ради встреч, заведённых двумя полями: форма склеит
 *  их при первой правке. */
export const MEETUP_VENUE_MAX = 200;
export const MEETUP_DESCRIPTION_MAX = 2000;

export type MeetupRights = {
  /** Принятый участник сообщества — может заводить встречи. */
  isMember: boolean;
  /** Создатель или модератор — может править и удалять ЛЮБУЮ встречу. */
  canManage: boolean;
  /**
   * Видно ли зрителю содержимое встречи. У участника совпадает с
   * `isMember`; отдельно он существует ради админа САЙТА: жалоба на
   * встречу приводит его из очереди модерации на её страницу, и 404 там
   * делал жалобу неразбираемой (аудит 2026-09, п.1.9). Право только
   * СМОТРЕТЬ: участником, автором и кандидатом на «иду» админ от этого
   * не становится — то же устройство, что `isSiteAdmin` в
   * `communityAccess`.
   */
  canSee: boolean;
};

const NO_RIGHTS: MeetupRights = { isMember: false, canManage: false, canSee: false };

/**
 * Права зрителя в сообществе встречи. Ходит в базу, поэтому вызывается
 * один раз на запрос — и в экшенах (проверка на сервере), и на вкладке
 * (что показывать).
 *
 * @param options.isSiteAdmin — зритель админ сайта: ему открывается
 *   ПРОСМОТР (canSee), и только он. Флаг передаёт вызывающий, у кого на
 *   руках объект пользователя, — сюда приходит один id.
 */
export async function communityRights(
  communityId: string,
  viewerId: string | null | undefined,
  options?: { isSiteAdmin?: boolean },
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
  const access = communityAccess(community, viewerId, community.members[0] ?? null, options);
  return {
    isMember: access.isMember,
    canManage: access.canManage,
    canSee: access.canSeeInside,
  };
}

/**
 * Может ли зритель открыть страницу события.
 *
 * Каталожное событие открыто всем — оно и должно быть в поиске. Встречу
 * видят только участники сообщества, и исключений для публики нет
 * (правка владельца 2026-09-08, флаг «показывать всем» отменён): в
 * `venue`/`address` у встречи стоит чей-то домашний адрес. Админ САЙТА —
 * не исключение из правила, а его часть: он и содержимое сообщества
 * видит целиком (`communityAccess`), и без страницы встречи жалоба на
 * неё была бы неразбираемой (аудит 2026-09, п.1.9).
 */
export async function canSeeMeetup(
  event: { communityId: string | null },
  viewerId: string | null | undefined,
  options?: { isSiteAdmin?: boolean },
): Promise<boolean> {
  if (!event.communityId) return true;
  const rights = await communityRights(event.communityId, viewerId, options);
  return rights.canSee;
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
