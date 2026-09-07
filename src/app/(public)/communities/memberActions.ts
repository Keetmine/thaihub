"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, getT, localeHref } from "@/lib/i18n";
import { getFriendIds } from "@/lib/friends";
import { notifyUser } from "@/lib/notifications";
import type { ActionResult } from "./actions";

/**
 * Люди сообщества (АА25, этап 2): роли, бан и приглашения.
 *
 * Отдельный файл от `actions.ts` не ради красоты: там — само сообщество
 * (создание, настройки, ссылки), здесь — кто в нём состоит и на каких
 * правах. Правила у этих двух наборов разные, и вперемешку их уже не
 * прочитать за один заход.
 *
 * Все проверки прав — ЗДЕСЬ, а не в интерфейсе. Кнопку можно не
 * показать, а экшен всё равно вызывается напрямую: сервер обязан
 * проверять сам.
 */

/**
 * Тот, кто вправе распоряжаться людьми сообщества: владелец или
 * модератор. Копия одноимённого помощника из `actions.ts`, и это
 * намеренно: файл помечен `"use server"`, а значит любой его экспорт
 * становится вызываемой снаружи точкой входа. Экспортировать помощника,
 * который отдаёт наружу объект пользователя и сообщества, ради экономии
 * десяти строк — плохой обмен.
 */
async function requireManaged(communityId: string) {
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/communities", await getLocale()));
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    include: { members: { where: { userId: user.id } } },
  });
  if (!community) return null;
  const isOwner = community.ownerId === user.id;
  const mine = community.members[0];
  // Модератор — только действующий участник: роль в строке может
  // остаться со времён, когда человека ещё не убрали.
  const isModerator = mine?.role === "MODERATOR" && mine.status === "ACTIVE";
  if (!isOwner && !isModerator) return null;
  return { user, community, isOwner };
}

/** Обновить обе страницы, где число участников на виду. */
function revalidateCommunity(communityId: string) {
  revalidatePath(`/communities/${communityId}`);
  revalidatePath("/communities");
}

// ---------- роли ----------

/**
 * Назначить участника модератором и снять обратно — только владелец.
 *
 * Модератор решает по заявкам, зовёт людей и убирает их, но не трогает
 * ни настройки сообщества, ни его видимость, ни само его существование
 * (это проверяется в `updateCommunity`/`deleteCommunity`). Раздавать
 * такие права может лишь тот, чьё сообщество, — иначе двое модераторов
 * назначали бы друг друга, и владелец узнавал бы об этом последним.
 */
export async function setCommunityMemberRole(
  communityId: string,
  userId: string,
  moderator: boolean,
): Promise<ActionResult> {
  const { t } = await getT();
  const s = t.communities;
  const managed = await requireManaged(communityId);
  if (!managed) return { ok: false, error: s.errors.notFound };
  if (!managed.isOwner) return { ok: false, error: s.people.errors.ownerOnly };
  // Владелец и так владелец: роль OWNER в строке — отражение поля
  // `Community.ownerId`, и переписывать её нечем.
  if (managed.community.ownerId === userId) {
    return { ok: false, error: s.people.errors.ownerOnly };
  }

  const updated = await prisma.communityMember.updateMany({
    where: { communityId, userId, status: "ACTIVE" },
    data: { role: moderator ? "MODERATOR" : "MEMBER" },
  });
  if (updated.count === 0) return { ok: false, error: s.people.errors.notMember };

  revalidateCommunity(communityId);
  return { ok: true };
}

// ---------- бан ----------

/**
 * Убрать человека из сообщества.
 *
 * Строка `CommunityMember` при этом НЕ удаляется, а переводится в
 * статус `BANNED`. Удалить её значило бы просто попросить человека
 * выйти: в открытое сообщество он вступил бы обратно тем же нажатием, в
 * сообщество «по одобрению» — подал бы заявку заново, и всё началось бы
 * сначала. Оставшаяся строка — и есть запрет: её видят `communityAccess`
 * (нет кнопки «Вступить») и `joinCommunity` (внятная ошибка вместо
 * молчания).
 *
 * Забаненный не считается участником нигде: и счётчики на витрине, и
 * список участников фильтруют по `status: "ACTIVE"`.
 *
 * Владельца убрать нельзя ни модератору, ни ему самому: сообщество
 * осталось бы без хозяина. Модератора убирает только владелец —
 * модераторы друг другу равны, и войну между ними разнимать некому.
 */
export async function banCommunityMember(
  communityId: string,
  userId: string,
): Promise<ActionResult> {
  const { t } = await getT();
  const s = t.communities;
  const managed = await requireManaged(communityId);
  if (!managed) return { ok: false, error: s.errors.notFound };
  if (managed.community.ownerId === userId) {
    return { ok: false, error: s.people.errors.ownerBan };
  }

  const target = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (!target || target.status === "BANNED") {
    return { ok: false, error: s.people.errors.notMember };
  }
  if (target.role === "MODERATOR" && !managed.isOwner) {
    return { ok: false, error: s.people.errors.moderatorBan };
  }

  await prisma.$transaction([
    // Роль снимаем вместе со статусом: разбанят — вернётся обычным
    // участником, а не сразу модератором.
    prisma.communityMember.update({
      where: { communityId_userId: { communityId, userId } },
      data: { status: "BANNED", role: "MEMBER" },
    }),
    // Висящее приглашение убираем: принять его — значит обойти бан.
    prisma.communityInvite.deleteMany({ where: { communityId, userId } }),
  ]);

  revalidateCommunity(communityId);
  return { ok: true };
}

/**
 * Снять запрет.
 *
 * Строка удаляется целиком, а не переводится в `ACTIVE`: снять запрет —
 * это разрешить человеку вернуться, а не вернуть его насильно. Решать,
 * хочет ли он обратно, ему самому — как и при первом вступлении.
 */
export async function unbanCommunityMember(
  communityId: string,
  userId: string,
): Promise<ActionResult> {
  const { t } = await getT();
  const s = t.communities;
  const managed = await requireManaged(communityId);
  if (!managed) return { ok: false, error: s.errors.notFound };

  const removed = await prisma.communityMember.deleteMany({
    where: { communityId, userId, status: "BANNED" },
  });
  if (removed.count === 0) return { ok: false, error: s.people.errors.notMember };

  revalidateCommunity(communityId);
  return { ok: true };
}

// ---------- приглашения ----------

export type InviteCandidate = {
  id: string;
  name: string | null;
  username: string | null;
  photoUrl: string | null;
  /** Друг приглашающего — таких показываем сразу, без поиска. */
  isFriend: boolean;
};

/**
 * Кого можно позвать: с пустым запросом — друзья приглашающего, с
 * запросом — поиск по имени и нику среди всех.
 *
 * Два источника, потому что зовут по-разному: в компанию на фестиваль —
 * своих друзей (их и показываем сразу списком), а в тематическое
 * сообщество — человека, которого знаешь по нику с сайта и в друзьях не
 * держишь. Так же устроен поиск на странице друзей.
 *
 * Почту тут не ищем даже точным совпадением (в отличие от друзей):
 * приглашение видит любой модератор сообщества, и превращать его в
 * способ проверить «а есть ли такой адрес» не хочется.
 */
export async function searchInviteCandidates(
  communityId: string,
  query: string,
): Promise<InviteCandidate[]> {
  const managed = await requireManaged(communityId);
  if (!managed) return [];

  const q = query.trim().replace(/^@/, "").slice(0, 60);
  const friendIds = await getFriendIds(managed.user.id);

  // Уже в сообществе (в любом статусе, включая убранных) и уже
  // позванные — не кандидаты: звать их второй раз нечего.
  const [members, invites] = await Promise.all([
    prisma.communityMember.findMany({ where: { communityId }, select: { userId: true } }),
    prisma.communityInvite.findMany({ where: { communityId }, select: { userId: true } }),
  ]);
  const busy = new Set<string>([
    managed.user.id,
    managed.community.ownerId,
    ...members.map((m) => m.userId),
    ...invites.map((i) => i.userId),
  ]);

  const where = q
    ? {
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { username: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : { deletedAt: null, id: { in: friendIds } };

  const found = await prisma.user.findMany({
    where,
    select: { id: true, name: true, username: true, photoUrl: true },
    orderBy: { name: "asc" },
    take: 40,
  });

  const friendSet = new Set(friendIds);
  return found
    .filter((u) => !busy.has(u.id))
    .map((u) => ({ ...u, isFriend: friendSet.has(u.id) }));
}

/**
 * Позвать человека в сообщество.
 *
 * Приглашение — это НЕ зачисление: создаётся строка `CommunityInvite`, а
 * человек получает уведомление и решает сам. Молча добавлять людей в
 * сообщества нельзя: у закрытого сообщества за дверью чужие адреса и
 * закрытый чат, и оказаться там без своего согласия — неприятный
 * сюрприз, а не подарок.
 *
 * Для закрытого сообщества это единственный вход: заявок с улицы оно не
 * принимает (см. `joinCommunity`).
 */
export async function inviteToCommunity(
  communityId: string,
  userId: string,
): Promise<ActionResult> {
  const { t } = await getT();
  const s = t.communities;
  const managed = await requireManaged(communityId);
  if (!managed) return { ok: false, error: s.errors.notFound };

  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!target) return { ok: false, error: s.errors.notFound };

  const existing = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (existing?.status === "BANNED") {
    // Приглашение поверх бана — способ его обойти. Хотите позвать —
    // сначала снимите запрет, это отдельное осознанное действие.
    return { ok: false, error: s.people.errors.inviteBanned };
  }
  if (existing || managed.community.ownerId === userId) {
    return { ok: false, error: s.people.errors.alreadyIn };
  }

  // Повторное нажатие ничего не ломает: приглашение уникально по паре
  // (сообщество, человек), второе просто ничего не меняет.
  const created = await prisma.communityInvite.createMany({
    data: { communityId, userId, invitedById: managed.user.id },
    skipDuplicates: true,
  });

  if (created.count > 0) {
    await notifyUser({
      userId,
      actorId: managed.user.id,
      kind: "COMMUNITY_INVITE",
      actorName: managed.user.name,
      subject: managed.community.title,
      href: `/communities/${managed.community.slug ?? managed.community.id}`,
    });
  }

  revalidateCommunity(communityId);
  return { ok: true };
}

/** Отозвать приглашение — позвали по ошибке или человек молчит месяц. */
export async function cancelCommunityInvite(
  communityId: string,
  userId: string,
): Promise<ActionResult> {
  const { t } = await getT();
  const managed = await requireManaged(communityId);
  if (!managed) return { ok: false, error: t.communities.errors.notFound };
  await prisma.communityInvite.deleteMany({ where: { communityId, userId } });
  revalidateCommunity(communityId);
  return { ok: true };
}

/**
 * Принять приглашение — вот здесь человек и становится участником
 * (`ACTIVE`), минуя и «по одобрению», и закрытость сообщества: его уже
 * позвал тот, кто вправе звать.
 *
 * Приглашение после этого удаляется: оно своё дело сделало, а висящая
 * строка означала бы, что человека всё ещё зовут.
 */
export async function acceptCommunityInvite(communityId: string): Promise<ActionResult> {
  const { t } = await getT();
  const s = t.communities;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));

  const invite = await prisma.communityInvite.findUnique({
    where: { communityId_userId: { communityId, userId: user.id } },
  });
  if (!invite) return { ok: false, error: s.people.errors.noInvite };

  const existing = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId: user.id } },
  });
  // Успели убрать, пока приглашение висело, — бан сильнее приглашения.
  if (existing?.status === "BANNED") {
    await prisma.communityInvite.delete({ where: { id: invite.id } });
    return { ok: false, error: s.people.errors.banned };
  }

  await prisma.$transaction([
    prisma.communityMember.upsert({
      where: { communityId_userId: { communityId, userId: user.id } },
      create: { communityId, userId: user.id, status: "ACTIVE" },
      // Заявка, поданная раньше приглашения, приглашением и решается.
      update: { status: "ACTIVE" },
    }),
    prisma.communityInvite.delete({ where: { id: invite.id } }),
  ]);

  revalidateCommunity(communityId);
  return { ok: true };
}

/** Отказаться. Строка удаляется — позвать могут ещё раз, отказ не
 *  запрет. Приглашавшего не уведомляем: отказ — дело личное, и
 *  сообщать о нём значило бы объясняться перед тем, кого не звал. */
export async function declineCommunityInvite(communityId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));
  await prisma.communityInvite.deleteMany({ where: { communityId, userId: user.id } });
  revalidateCommunity(communityId);
  return { ok: true };
}
