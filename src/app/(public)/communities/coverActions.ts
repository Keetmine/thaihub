"use server";

import { revalidatePath } from "next/cache";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { communityHref } from "@/lib/slugHelpers";
import { parseCommunityCoverUrl } from "@/lib/communities";
import { requireManagedCommunity } from "@/lib/communities.server";

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

// «Кто вправе управлять» — общий requireManagedCommunity из
// lib/communities.server.ts (тот, кто правит название, правит и
// обложку): своя копия здесь смотрела роль без `status: "ACTIVE"` и
// держалась на том, что бан сбрасывает роль (аудит 2026-09, п.1.8).

/** Текущая обложка — окну управления, когда оно открывается. Страница
 *  сообщества её в `CommunityAdmin` не передаёт, а показать предпросмотр
 *  и кнопку «убрать» без неё нельзя. */
export async function loadCommunityCover(communityId: string): Promise<CoverResult> {
  const { t } = await getT();
  const managed = await requireManagedCommunity(communityId);
  if (!managed) return { ok: false, error: t.communities.errors.notFound };
  return { ok: true, coverUrl: managed.community.coverUrl };
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
  const managed = await requireManagedCommunity(communityId);
  if (!managed) return { ok: false, error: t.communities.errors.notFound };

  // Проверка адреса — общая с созданием сообщества
  // (`parseCommunityCoverUrl`): форма создания пишет обложку своим
  // экшеном, и вторая копия условия — второе место, где однажды
  // проглядят чужой домен.
  const parsed = parseCommunityCoverUrl(coverUrl);
  if (!parsed.ok) return { ok: false, error: t.communities.errors.coverUrl };

  await prisma.community.update({
    where: { id: managed.community.id },
    data: { coverUrl: parsed.url },
  });
  revalidatePath(communityHref(managed.community));
  return { ok: true, coverUrl: parsed.url };
}
