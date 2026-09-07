import type {
  CommunityJoinMode,
  CommunityMemberStatus,
  CommunityRole,
  CommunityVisibility,
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
  /** Видно ли содержимое: участники, ссылки, дальше — обсуждения и встречи. */
  canSeeInside: boolean;
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

export function communityAccess(
  community: CommunityForAccess,
  viewerId: string | null | undefined,
  membership: ViewerMembership,
): CommunityAccess {
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
    canSeeInside: isMember,
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

/** Сообщество названо, но пустым названием жить не может. */
export const COMMUNITY_TITLE_MAX = 80;
export const COMMUNITY_DESCRIPTION_MAX = 2000;
/** Потолок на человека: три сообщества — это уже «веду сообщества», а
 *  не «завёл на пробу». Мёртвые сообщества портят витрину сильнее, чем
 *  их отсутствие (см. docs/features/communities.md). */
export const COMMUNITY_LIMIT_PER_USER = 3;

/**
 * Сколько привязок к каталогу (`CommunityTopic`) можно повесить на одно
 * сообщество — артистов и сериалов ВМЕСТЕ.
 *
 * Ограничение принципиальное, а не техническое. Привязка — это то, ради
 * чего сообщество показывается на странице артиста и сериала, и она
 * должна отвечать на вопрос «о ком это сообщество». Сообщество города
 * любит всех подряд: список из сотни привязок никто не станет вести, а
 * на странице артиста он превратился бы в свалку из сообществ, которым
 * до него нет особого дела. Тем, кого ищут по месту, а не по актёру,
 * оставлены `country`/`city` и свой фильтр на витрине — см.
 * docs/features/communities.md, раздел «Связь с каталогом и место».
 */
export const COMMUNITY_TOPIC_LIMIT = 3;
