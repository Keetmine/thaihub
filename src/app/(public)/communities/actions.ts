"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, getT, localeHref } from "@/lib/i18n";
import { isPremiumActive } from "@/lib/premium";
import { notifyUser } from "@/lib/notifications";
import { notifyAdminsAboutCommunity } from "@/lib/adminNotify";
import { isAdminAuthenticated } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalogCache";
import { communityHref } from "@/lib/slugHelpers";
import { requireManagedCommunity } from "@/lib/communities.server";
import {
  COMMUNITY_DESCRIPTION_MAX,
  COMMUNITY_LIMIT_PER_USER,
  COMMUNITY_LINKS_AT_CREATE_MAX,
  COMMUNITY_TITLE_MAX,
  parseCommunityCoverUrl,
  parseCommunityLink,
  parseCommunityPlace,
  type CommunityLinkDraft,
} from "@/lib/communities";
import type { CommunityJoinMode, CommunityVisibility } from "@/generated/prisma/client";

/** Ошибки — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action, и клиент видит generic error boundary
 *  вместо причины (то же правило, что в lists/actions.ts). Экшены, что
 *  при успехе делают redirect, типизированы как `ActionError | void`. */
export type ActionError = { ok: false; error: string };
export type ActionResult = { ok: true } | ActionError;

function parseVisibility(raw: unknown): CommunityVisibility {
  return raw === "PRIVATE" ? "PRIVATE" : "PUBLIC";
}

function parseJoinMode(raw: unknown): CommunityJoinMode {
  return raw === "APPROVAL" ? "APPROVAL" : "OPEN";
}

/**
 * Ссылки из формы СОЗДАНИЯ: подписи и адреса приезжают параллельными
 * наборами одноимённых полей (в управлении ссылку добавляют по одной,
 * там формы отдельные). Пустой ряд пропускаем молча — это незаполненное
 * поле, а не ошибка: рядов в окне несколько, а заполняют обычно один.
 *
 * Разбор ряда — общий с `addCommunityLink` (`parseCommunityLink`):
 * запрет на `javascript:` в чужой ссылке существует в одном месте.
 */
function parseNewLinks(
  formData: FormData,
): { ok: true; links: CommunityLinkDraft[] } | { ok: false; reason: "required" | "url" } {
  const labels = formData.getAll("linkLabel");
  const urls = formData.getAll("linkUrl");
  const links: CommunityLinkDraft[] = [];
  for (let i = 0; i < labels.length && links.length < COMMUNITY_LINKS_AT_CREATE_MAX; i++) {
    const label = String(labels[i] ?? "").trim();
    const url = String(urls[i] ?? "").trim();
    if (!label && !url) continue;
    const parsed = parseCommunityLink(label, url);
    if (!parsed.ok) return parsed;
    links.push(parsed.link);
  }
  return { ok: true, links };
}

/**
 * Заводить сообщество — часть платного (решение владельца): вступать,
 * читать и участвовать можно без подписки, деньги берутся за роль
 * организатора. То же правило, что у списков мест.
 */
async function requirePremiumUser() {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));
  if (!isPremiumActive(user)) return { ok: false as const, error: t.communities.errors.premium };
  return { ok: true as const, user };
}

// «Кто вправе управлять» — общий requireManagedCommunity из
// lib/communities.server.ts: своя копия здесь смотрела роль без
// `status: "ACTIVE"` и держалась на том, что бан сбрасывает роль
// (аудит 2026-09, п.1.8).

export async function createCommunity(formData: FormData): Promise<ActionError | void> {
  const { locale, t } = await getT();
  const access = await requirePremiumUser();
  if (!access.ok) return access;
  const user = access.user;

  const title = String(formData.get("title") ?? "").trim().slice(0, COMMUNITY_TITLE_MAX);
  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, COMMUNITY_DESCRIPTION_MAX);
  if (!title) return { ok: false, error: t.communities.errors.titleRequired };

  // Всё остальное необязательно, но проверяется теми же правилами, что
  // и в управлении (правка владельца 2026-09-09: «сразу выводим все поля
  // и со странами и с фотками»). Обязательным осталось одно название:
  // сообщество заводят на настроении, и пять обязательных полей на входе
  // — верный способ не завести его вовсе.
  const place = parseCommunityPlace(formData.get("country"), formData.get("city"));
  if (!place.ok) return { ok: false, error: t.communities.topics.errors.cityWithoutCountry };

  // Обложка уже лежит на диске: форма грузит файл на /api/upload сразу
  // при выборе и приносит сюда только адрес (см. CreateCommunityButton).
  const cover = parseCommunityCoverUrl(formData.get("coverUrl"));
  if (!cover.ok) return { ok: false, error: t.communities.errors.coverUrl };

  const newLinks = parseNewLinks(formData);
  if (!newLinks.ok) {
    return {
      ok: false,
      error:
        newLinks.reason === "url"
          ? t.communities.errors.linkUrl
          : t.communities.errors.linkRequired,
    };
  }

  // Потолок на человека — против витрины из мёртвых сообществ.
  const mine = await prisma.community.count({ where: { ownerId: user.id } });
  if (mine >= COMMUNITY_LIMIT_PER_USER) {
    return { ok: false, error: t.communities.errors.limit(COMMUNITY_LIMIT_PER_USER) };
  }

  const community = await prisma.community.create({
    data: {
      ownerId: user.id,
      title,
      description: description || null,
      coverUrl: cover.url,
      country: place.country,
      city: place.city,
      // Зона встреч — зона того, кто заводит сообщество; дальше
      // правится в «Управлении» рядом со страной и городом.
      timezone: user.timezone,
      visibility: parseVisibility(formData.get("visibility")),
      joinMode: parseJoinMode(formData.get("joinMode")),
      // Ссылки — той же записью: за ссылкой обычно чат, ради которого
      // сообщество и заводят, и заставлять открывать «Управление» сразу
      // после создания незачем.
      ...(newLinks.links.length ? { links: { create: newLinks.links } } : {}),
      // Создатель сразу состоит в своём сообществе: иначе он не был бы в
      // списке участников и не получал бы того, что видят участники.
      members: { create: { userId: user.id, role: "OWNER", status: "ACTIVE" } },
    },
  });
  // Админам — сразу в Telegram: закрытое сообщество не попадает ни в
  // витрину, ни в поиск, и иначе о нём никто бы не узнал.
  notifyAdminsAboutCommunity({
    id: community.id,
    slug: community.slug,
    title: community.title,
    visibility: community.visibility,
    owner: { name: user.name, email: user.email },
  });
  revalidatePath("/communities");
  // Витрина сообществ лежит в unstable_cache: revalidatePath её не
  // трогает, свежесть даёт только сброс тега (см. communities/page.tsx).
  invalidateCatalogCache();
  redirect(localeHref(communityHref(community), locale));
}

export async function updateCommunity(
  communityId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { t } = await getT();
  const managed = await requireManagedCommunity(communityId);
  if (!managed) return { ok: false, error: t.communities.errors.notFound };

  const title = String(formData.get("title") ?? "").trim().slice(0, COMMUNITY_TITLE_MAX);
  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, COMMUNITY_DESCRIPTION_MAX);
  if (!title) return { ok: false, error: t.communities.errors.titleRequired };

  await prisma.community.update({
    where: { id: communityId },
    data: {
      title,
      description: description || null,
      // Видимость и правила вступления меняет только владелец: это
      // решения про само сообщество, а не про его наполнение.
      ...(managed.isOwner
        ? {
            visibility: parseVisibility(formData.get("visibility")),
            joinMode: parseJoinMode(formData.get("joinMode")),
          }
        : {}),
    },
  });
  revalidatePath(`/communities/${communityId}`);
  revalidatePath("/communities");
  // Витрина сообществ лежит в unstable_cache: revalidatePath её не
  // трогает, свежесть даёт только сброс тега (см. communities/page.tsx).
  invalidateCatalogCache();
  return { ok: true };
}

export async function deleteCommunity(communityId: string): Promise<ActionError | void> {
  const { locale, t } = await getT();
  // Админ сайта удаляет любое сообщество: оно живёт на её домене, и
  // отвечает за него она — а создатель проблемного сообщества сносить
  // его сам, разумеется, не станет. Проверку админа делаем ПЕРВОЙ, чтобы
  // не звать requireManagedCommunity: тот уводит редиректом всякого, кто
  // в сообществе не хозяин.
  if (!(await isAdminAuthenticated())) {
    const managed = await requireManagedCommunity(communityId);
    // Из своих удаляет только владелец: модератор следит за порядком, а
    // не распоряжается чужим сообществом.
    if (!managed?.isOwner) return { ok: false, error: t.communities.errors.notFound };
  }
  // deleteMany, а не delete: у админского пути объекта на руках нет, и
  // «уже удалили в соседней вкладке» — не повод для 500.
  const { count } = await prisma.community.deleteMany({ where: { id: communityId } });
  if (count === 0) return { ok: false, error: t.communities.errors.notFound };
  revalidatePath("/communities");
  // Витрина сообществ лежит в unstable_cache: revalidatePath её не
  // трогает, свежесть даёт только сброс тега (см. communities/page.tsx).
  invalidateCatalogCache();
  redirect(localeHref("/communities", locale));
}

/**
 * Вступить. При открытом сообществе человек участник сразу, при
 * «по одобрению» — заявка владельцу.
 *
 * В приватное с улицы не вступают: туда зовёт владелец, поэтому кнопки
 * там нет (см. `communityAccess`), а экшен на всякий случай проверяет
 * это ещё раз — форму можно отправить и мимо кнопки.
 */
export async function joinCommunity(communityId: string): Promise<ActionResult> {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));

  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!community || community.visibility === "PRIVATE") {
    return { ok: false, error: t.communities.errors.notFound };
  }

  // Убранного не пускаем обратно: ради этого строка со статусом BANNED
  // и остаётся в базе (см. banCommunityMember в memberActions.ts).
  // Проверка отдельная, а не молчаливый no-op в upsert: человек должен
  // видеть причину, а не жать кнопку без всякого эффекта.
  const existing = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId: user.id } },
  });
  if (existing?.status === "BANNED") {
    return { ok: false, error: t.communities.people.errors.banned };
  }

  const status = community.joinMode === "APPROVAL" ? "PENDING" : "ACTIVE";
  await prisma.communityMember.upsert({
    where: { communityId_userId: { communityId, userId: user.id } },
    // Повторное нажатие ничего не меняет: принятого не разжалуем в
    // заявку, а заявку не одобряем сами себе.
    update: {},
    create: { communityId, userId: user.id, status },
  });

  if (status === "PENDING") {
    await notifyUser({
      userId: community.ownerId,
      actorId: user.id,
      kind: "COMMUNITY_JOIN_REQUEST",
      actorName: user.name,
      subject: community.title,
      href: `/communities/${community.slug ?? community.id}`,
    });
  }
  revalidatePath(`/communities/${communityId}`);
  return { ok: true };
}

/** Выйти самому. Владелец так уйти не может: сообщество осталось бы без
 *  хозяина — у него есть «удалить». */
export async function leaveCommunity(communityId: string): Promise<ActionResult> {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", await getLocale()));

  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!community) return { ok: false, error: t.communities.errors.notFound };
  if (community.ownerId === user.id) return { ok: false, error: t.communities.errors.ownerLeave };

  await prisma.communityMember.deleteMany({ where: { communityId, userId: user.id } });
  revalidatePath(`/communities/${communityId}`);
  return { ok: true };
}

/** Решение по заявке: принять или отклонить. Обе ветки уведомляют
 *  заявителя — молчание в ответ на заявку выглядит хуже отказа. */
export async function answerJoinRequest(
  communityId: string,
  userId: string,
  accept: boolean,
): Promise<ActionResult> {
  const { t } = await getT();
  const managed = await requireManagedCommunity(communityId);
  if (!managed) return { ok: false, error: t.communities.errors.notFound };

  const pending = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (!pending || pending.status !== "PENDING") {
    return { ok: false, error: t.communities.errors.noRequest };
  }

  if (accept) {
    await prisma.communityMember.update({
      where: { communityId_userId: { communityId, userId } },
      data: { status: "ACTIVE" },
    });
  } else {
    await prisma.communityMember.delete({
      where: { communityId_userId: { communityId, userId } },
    });
  }

  // Заголовок собирается на языке ПОЛУЧАТЕЛЯ (см. notificationText.ts),
  // поэтому в базу уезжают части, а не готовая фраза: приняли или нет —
  // различает subject с приставкой.
  await notifyUser({
    userId,
    actorId: managed.user.id,
    kind: "COMMUNITY_JOIN_ANSWER",
    actorName: managed.user.name,
    subject: `${accept ? "+" : "-"}${managed.community.title}`,
    href: accept
      ? `/communities/${managed.community.slug ?? managed.community.id}`
      : "/communities",
  });
  revalidatePath(`/communities/${communityId}`);
  return { ok: true };
}

// Роли, бан и приглашения живут в соседнем memberActions.ts: это работа
// с людьми, а не с самим сообществом, и вместе оба набора уже не
// читались бы за один заход.

// ---------- ссылки сообщества ----------

export async function addCommunityLink(
  communityId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { t } = await getT();
  const managed = await requireManagedCommunity(communityId);
  if (!managed) return { ok: false, error: t.communities.errors.notFound };

  const parsed = parseCommunityLink(formData.get("label"), formData.get("url"));
  if (!parsed.ok) {
    return {
      ok: false,
      error:
        parsed.reason === "url" ? t.communities.errors.linkUrl : t.communities.errors.linkRequired,
    };
  }

  await prisma.communityLink.create({ data: { communityId, ...parsed.link } });
  revalidatePath(`/communities/${communityId}`);
  return { ok: true };
}

export async function deleteCommunityLink(
  communityId: string,
  linkId: string,
): Promise<ActionResult> {
  const { t } = await getT();
  const managed = await requireManagedCommunity(communityId);
  if (!managed) return { ok: false, error: t.communities.errors.notFound };
  await prisma.communityLink.deleteMany({ where: { id: linkId, communityId } });
  revalidatePath(`/communities/${communityId}`);
  return { ok: true };
}
