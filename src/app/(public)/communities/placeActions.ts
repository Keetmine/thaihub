"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getT, localeHref } from "@/lib/i18n";
import { communityRights } from "@/lib/meetups";
import { communityHref } from "@/lib/slugHelpers";
import { getCurrentUser } from "@/lib/userAuth";

/**
 * Общие места сообщества (АА25): «куда сходить в Минске».
 *
 * Здесь только ЗАВЕДЕНИЕ списка сообщества — всё остальное (места,
 * заметки, порядок, видимость, удаление) делают готовые экшены
 * `lists/actions.ts`: список сообщества — обычный `PlaceList` с
 * проставленным `communityId`, и второй копии тех же экшенов ему не
 * нужно. Расширена там ровно одна вещь — проверка прав
 * (`requireListRights`): у списка сообщества право даёт роль в
 * сообществе, а не строка `userId`.
 *
 * Создание живёт отдельным файлом, а не в `lists/actions.ts`, потому что
 * право здесь другое и считается по сообществу.
 */

/** Ошибки — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action, и форма показала бы generic error. */
export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Завести общий список мест сообщества.
 *
 * Кто может: создатель или модератор (`communityRights.canManage`) —
 * тот же круг лиц, что правит название сообщества. Проверка стоит ЗДЕСЬ,
 * на сервере: страница сообщества открывается и постороннему, а
 * серверный экшен вызывается и мимо интерфейса.
 *
 * Подписки НЕ требует, в отличие от личного списка на `/lists`: само
 * сообщество уже завёл подписчик, а участие в сообществе — и ведение
 * его общих списков в том числе — бесплатное.
 *
 * `userId` списка — тот, кто завёл: строка `PlaceList` без владельца
 * жить не может, но прав на список она больше не даёт.
 */
export async function createCommunityPlaceList(
  communityId: string,
  formData: FormData,
): Promise<ActionResult | void> {
  const { locale, t } = await getT();
  const s = t.communities.places;
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));

  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { id: true, slug: true },
  });
  if (!community) return { ok: false, error: s.errors.notFound };

  const rights = await communityRights(community.id, user.id);
  if (!rights.canManage) return { ok: false, error: s.errors.forbidden };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title) return { ok: false, error: s.errors.titleRequired };

  // По умолчанию список остаётся внутри сообщества (PRIVATE = «только
  // участникам»), открывает его наружу отдельный ЖЕСТ — как у встреч с
  // `communityOnly`. Пропущенная галочка не должна выносить наружу
  // ничего. «Для друзей» тут не предлагается вовсе: дружба — про
  // человека, а список принадлежит сообществу.
  const isPublic = formData.get("public") === "on";

  const list = await prisma.placeList.create({
    data: {
      userId: user.id,
      communityId: community.id,
      title,
      description: description || null,
      visibility: isPublic ? "PUBLIC" : "PRIVATE",
    },
  });

  revalidatePath(communityHref(community));
  redirect(localeHref(`/lists/${list.slug ?? list.id}`, locale));
}
