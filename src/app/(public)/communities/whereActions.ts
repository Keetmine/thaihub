"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getLocale, getT, localeHref } from "@/lib/i18n";
import { communityHref } from "@/lib/slugHelpers";
import { parseCommunityPlace } from "@/lib/communities";

/**
 * Где живёт сообщество — страна и город (АА25).
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

export type CommunityPlaceState = { ok: true; country: string; city: string } | ActionError;

/** Правит тот же круг, что и название: владелец и модератор. Своя копия
 *  проверки — в actions.ts она модульно-приватная. */
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

/** Текущее место — окну управления при открытии (страница его не
 *  передаёт, у неё свой набор пропсов). */
export async function loadCommunityPlace(communityId: string): Promise<CommunityPlaceState> {
  const { t } = await getT();
  const community = await requireManaged(communityId);
  if (!community) return { ok: false, error: t.communities.errors.notFound };
  return { ok: true, country: community.country ?? "", city: community.city ?? "" };
}

export async function saveCommunityPlace(
  communityId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { t } = await getT();
  const community = await requireManaged(communityId);
  if (!community) return { ok: false, error: t.communities.errors.notFound };

  // Разбор и правило «город без страны не бывает» — общие с созданием
  // сообщества (`parseCommunityPlace`): две копии условия однажды
  // разъехались бы, и на витрине завёлся бы ненаходимый город.
  const place = parseCommunityPlace(formData.get("country"), formData.get("city"));
  if (!place.ok) return { ok: false, error: t.communities.topics.errors.cityWithoutCountry };

  await prisma.community.update({
    where: { id: community.id },
    data: { country: place.country, city: place.city },
  });
  revalidatePath(communityHref(community));
  revalidatePath("/communities");
  return { ok: true };
}
