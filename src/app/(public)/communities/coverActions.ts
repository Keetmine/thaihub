"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, getT, localeHref } from "@/lib/i18n";
import { communityHref } from "@/lib/slugHelpers";

/** Ошибки — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action, и клиент видит generic error boundary
 *  вместо причины. То же правило, что в actions.ts рядом. */
export type CoverResult = { ok: true; coverUrl: string | null } | { ok: false; error: string };

/**
 * Обложка сообщества живёт отдельным экшеном, а не полем формы правки:
 * картинка уезжает на `/api/upload` ДО сабмита формы и возвращается
 * готовым адресом. Класть её в общую форму значило бы, что отменённая
 * правка названия молча откатывает и загруженную обложку.
 */

/** Сообщество, которым текущий пользователь вправе управлять (владелец
 *  или модератор), либо null. Своя копия проверки: в actions.ts она
 *  модульно-приватная, а тянуть её наружу ради одного вызова — значит
 *  расширять чужой публичный интерфейс. Правило одно и то же: тот, кто
 *  правит название, правит и обложку. */
async function requireManaged(communityId: string) {
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/communities", await getLocale()));
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    include: { members: { where: { userId: user.id } } },
  });
  if (!community) return null;
  const isOwner = community.ownerId === user.id;
  const isModerator = community.members[0]?.role === "MODERATOR";
  if (!isOwner && !isModerator) return null;
  return community;
}

/** Текущая обложка — окну управления, когда оно открывается. Страница
 *  сообщества её в `CommunityAdmin` не передаёт, а показать предпросмотр
 *  и кнопку «убрать» без неё нельзя. */
export async function loadCommunityCover(communityId: string): Promise<CoverResult> {
  const { t } = await getT();
  const community = await requireManaged(communityId);
  if (!community) return { ok: false, error: t.communities.errors.notFound };
  return { ok: true, coverUrl: community.coverUrl };
}

/**
 * Поставить или снять обложку. `coverUrl = null` — снять.
 *
 * Принимаем только наши же `/uploads/…`: адрес уходит прямо в `<img
 * src>` на публичной странице, и чужой домен в нём — это и утечка
 * реферера всем, кто открыл сообщество, и картинка, которая в любой
 * момент станет чем угодно. Файл сюда попадает только через
 * `/api/upload`, а тот отдаёт ровно такие пути.
 */
export async function setCommunityCover(
  communityId: string,
  coverUrl: string | null,
): Promise<CoverResult> {
  const { t } = await getT();
  const community = await requireManaged(communityId);
  if (!community) return { ok: false, error: t.communities.errors.notFound };

  const next = coverUrl?.trim() || null;
  // `..` отдельно: без него `/uploads/../../etc` прошёл бы проверку
  // префикса и увёл бы <img> с картинок куда угодно.
  if (next && (!next.startsWith("/uploads/") || next.includes(".."))) {
    return { ok: false, error: t.communities.errors.coverUrl };
  }

  await prisma.community.update({
    where: { id: community.id },
    data: { coverUrl: next },
  });
  revalidatePath(communityHref(community));
  return { ok: true, coverUrl: next };
}
