import type {
  CommunityJoinMode,
  CommunityMemberStatus,
  CommunityRole,
  CommunityVisibility,
  Prisma,
} from "@/generated/prisma/client";

/**
 * Кто и что видит в сообществе (АА25).
 *
 * Правило одно, и оно важнее любого другого в этой фиче: **витрина —
 * всем, содержимое — участникам**. Внутри сообщества живут встречи с
 * адресами и ссылки на закрытые чаты, и утечь наружу они не должны ни
 * гостю, ни поисковику (решение владельца 2026-09-08).
 *
 * Витрина (обложка, название, описание, число участников) у публичного
 * сообщества открыта всем — это и есть SEO-повод: человек ищет «лакорны
 * Беларусь», находит страницу и заводит аккаунт, чтобы вступить.
 *
 * У приватного нет и витрины: страница открывается по прямой ссылке и
 * показывает только название с пометкой «закрытое».
 */

export type CommunityForAccess = {
  ownerId: string;
  visibility: CommunityVisibility;
  joinMode: CommunityJoinMode;
};

export type ViewerMembership = {
  role: CommunityRole;
  status: CommunityMemberStatus;
} | null;

export type CommunityAccess = {
  /** Открывается ли страница вообще (иначе — 404). */
  canOpen: boolean;
  /** Видно ли содержимое: участники, ссылки, обсуждения, встречи. */
  canSeeInside: boolean;
  /**
   * Зритель — админ САЙТА, а не участник сообщества. Он видит содержимое
   * закрытого сообщества (иначе разбирать жалобы было бы не по чему), но
   * участником при этом не становится: не попадает в список людей, не
   * получает уведомлений и не «управляет» сообществом снаружи. Флаг
   * отдаётся наружу, чтобы страница могла честно сказать «вы смотрите
   * как администратор», а не притворяться, что он свой.
   */
  isSiteAdmin: boolean;
  /**
   * Можно ли ЗАГЛЯНУТЬ снаружи: вкладки видны, публичные темы
   * перечислены заголовками, встречи — закрытыми карточками с датой
   * (правка владельца 2026-09-09).
   *
   * Смысл в том, чтобы человек с улицы понимал, ради чего вступать:
   * пустая заглушка «внутри для участников» ничего про сообщество не
   * говорит. Открыть тему, прочитать разговор, увидеть адрес встречи и
   * список участников по-прежнему нельзя — снаружи виден заголовок, а
   * не содержимое. У закрытого сообщества нет и этого.
   */
  canBrowse: boolean;
  /** Принятый участник (заявка в ожидании — ещё нет). */
  isMember: boolean;
  /** Заявка подана и ждёт решения. */
  isPending: boolean;
  /** Убран из сообщества. Строка участника при этом ОСТАЁТСЯ (статус
   *  BANNED): удали её — и человек в ту же минуту вступит заново. */
  isBanned: boolean;
  isOwner: boolean;
  /** Владелец или модератор — может править сообщество и решать по заявкам. */
  canManage: boolean;
  /** Показывать ли кнопку «Вступить». */
  canJoin: boolean;
  /** Отдавать ли страницу поисковикам. */
  indexable: boolean;
};

/**
 * @param options.isSiteAdmin — зритель админ сайта (`User.isAdmin`).
 *   Модерация сообществ (АА25, админский этап) устроена так: чужое
 *   сообщество на своём домене владелица должна уметь ОТКРЫТЬ и
 *   прочитать, включая закрытое, — иначе жалоба «там творится дичь»
 *   неразбираема. Поэтому админу открывается содержимое, и только оно:
 *   участником, модератором и кандидатом на вступление он от этого не
 *   становится (см. `isSiteAdmin` в `CommunityAccess`).
 */
export function communityAccess(
  community: CommunityForAccess,
  viewerId: string | null | undefined,
  membership: ViewerMembership,
  options?: { isSiteAdmin?: boolean },
): CommunityAccess {
  const isSiteAdmin = !!viewerId && !!options?.isSiteAdmin;
  const isOwner = !!viewerId && community.ownerId === viewerId;
  const isMember = isOwner || membership?.status === "ACTIVE";
  const isPending = membership?.status === "PENDING";
  // Владельца забанить нельзя, но строку ему испортить теоретически
  // можно — на всякий случай его статус тут не решает ничего.
  const isBanned = !isOwner && membership?.status === "BANNED";
  const isPublic = community.visibility === "PUBLIC";

  return {
    // Приватное сообщество открывается по ссылке — «страницы нет» было
    // бы враньём, а вот содержимого гостю там не покажут.
    canOpen: true,
    canSeeInside: isMember || isSiteAdmin,
    // «Заглянуть снаружи» — режим для того, кто внутрь не попал. Админ
    // уже внутри, и без этого условия страница нарисовала бы ему обе
    // версии вкладок разом.
    canBrowse: isPublic && !isMember && !isSiteAdmin,
    isSiteAdmin,
    isMember,
    isPending,
    isBanned,
    isOwner,
    // Модератор — только принятый участник: у забаненного роль в строке
    // может остаться со времён, когда он ею был.
    canManage: isOwner || (isMember && membership?.role === "MODERATOR"),
    // Гостю кнопку не рисуем: вступать некому, сначала вход. Приватное
    // сообщество заявок со стороны не принимает — туда зовёт владелец.
    // Убранному не рисуем тоже: ради этого строка BANNED и живёт.
    canJoin: !!viewerId && !isMember && !isPending && !isBanned && isPublic,
    indexable: isPublic,
  };
}

/**
 * Сообщества, где зритель — ДЕЙСТВУЮЩИЙ участник (`status = ACTIVE`).
 *
 * Это то самое условие, за которым живёт всё содержимое сообщества:
 * темы, встречи с адресами, списки мест. Оно и раньше существовало —
 * россыпью одинаковых `members: { some: { userId, status: "ACTIVE" } }`
 * по выборкам, — и вот тут-то и опасно: одна копия, отставшая от
 * остальных, молча покажет чужое. Поэтому условие живёт одной строкой,
 * рядом с `communityAccess`, который решает то же самое для одной
 * страницы.
 *
 * Гостю функция не отдаёт ничего по НЕВОЗМОЖНОМУ условию, а не по
 * забытому снаружи `if`: пустой `userId` не должен превращаться в
 * выборку «все сообщества». То же правило, что у `viewerMeetupsWhere`
 * (`src/lib/catalogEvents.ts`), — она через эту функцию и работает.
 *
 * ```ts
 * where: { community: viewerCommunitiesWhere(userId) }
 * ```
 */
export function viewerCommunitiesWhere(
  userId: string | null | undefined,
): Prisma.CommunityWhereInput {
  if (!userId) return { id: { in: [] } };
  return { members: { some: { userId, status: "ACTIVE" } } };
}

/** Сообщество названо, но пустым названием жить не может. */
export const COMMUNITY_TITLE_MAX = 80;
export const COMMUNITY_DESCRIPTION_MAX = 2000;
/** Потолок на человека: три сообщества — это уже «веду сообщества», а
 *  не «завёл на пробу». Мёртвые сообщества портят витрину сильнее, чем
 *  их отсутствие (см. docs/features/communities.md). */
export const COMMUNITY_LIMIT_PER_USER = 3;

