"use server";

import { revalidatePath } from "next/cache";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { communityHref } from "@/lib/slugHelpers";
import { parseCommunityPlace } from "@/lib/communities";
import { requireManagedCommunity } from "@/lib/communities.server";
import { invalidateCatalogCache } from "@/lib/catalogCache";
import { DEFAULT_TIMEZONE, isKnownTimezone } from "@/lib/timezones";

/**
 * Где живёт сообщество — страна и город (АА25), а с 2026-09-17 ещё и
 * таймзона встреч (правка владельца: время встречи по Минску
 * показывалось как тайское).
 *
 * Раньше рядом с этим жили ещё привязки к артистам и сериалам, но
 * владелец их отменила (2026-09-09): «я могу любить 20 актёров и
 * сделать сообщество по всем ним» — лимит в три привязки мешал, а без
 * лимита список превращался в свалку на странице артиста. Место
 * осталось: по нему сообщества и ищут на витрине, и оно же показывается
 * на самой странице сообщества.
 *
 * Отдельный файл экшенов — граница та же, что у обложки и встреч: свой
 * кусок правится, не задевая настройки сообщества.
 */
export type ActionError = { ok: false; error: string };
export type ActionResult = { ok: true } | ActionError;

export type CommunityPlaceState =
  | { ok: true; country: string; city: string; timezone: string }
  | ActionError;

// Правит тот же круг, что и название: владелец и действующий модератор —
// общий requireManagedCommunity из lib/communities.server.ts. Своя копия
// здесь смотрела роль без `status: "ACTIVE"` (аудит 2026-09, п.1.8).

/** Текущее место — окну управления при открытии (страница его не
 *  передаёт, у неё свой набор пропсов). */
export async function loadCommunityPlace(communityId: string): Promise<CommunityPlaceState> {
  const { t } = await getT();
  const managed = await requireManagedCommunity(communityId);
  if (!managed) return { ok: false, error: t.communities.errors.notFound };
  const { community } = managed;
  return {
    ok: true,
    country: community.country ?? "",
    city: community.city ?? "",
    timezone: community.timezone ?? DEFAULT_TIMEZONE,
  };
}

export async function saveCommunityPlace(
  communityId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { t } = await getT();
  const managed = await requireManagedCommunity(communityId);
  if (!managed) return { ok: false, error: t.communities.errors.notFound };

  // Разбор и правило «город без страны не бывает» — общие с созданием
  // сообщества (`parseCommunityPlace`): две копии условия однажды
  // разъехались бы, и на витрине завёлся бы ненаходимый город.
  const place = parseCommunityPlace(formData.get("country"), formData.get("city"));
  if (!place.ok) return { ok: false, error: t.communities.topics.errors.cityWithoutCountry };

  // Зона встреч — из того же окна, что страна и город: где сообщество,
  // по тем часам и собирается. Неизвестное значение не пишем.
  const rawTz = String(formData.get("timezone") ?? "");
  const timezone = isKnownTimezone(rawTz) ? rawTz : undefined;
  await prisma.community.update({
    where: { id: managed.community.id },
    data: { country: place.country, city: place.city, ...(timezone ? { timezone } : {}) },
  });
  revalidatePath(communityHref(managed.community));
  revalidatePath("/communities");
  // Место — это ещё и ряды фильтра на витрине, а они кэшированы: без
  // сброса тега новая страна появилась бы в ряду только через полчаса.
  invalidateCatalogCache();
  return { ok: true };
}
