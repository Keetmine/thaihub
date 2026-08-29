"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { socialLinkKey, SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/socialLinks";
import { requireCatalogEditor } from "@/lib/auth";
import { logAudit, diffRecords } from "@/lib/audit";
import { performerNameWhere, performerOptionLabel } from "@/lib/searchWhere";



/** Live "похоже, уже есть" lookup for the create form's name field. */
/**
 * Асинхронный поиск для комбобоксов выбора актёров (EventForm/DramaForm):
 * каталог вырос до ~17 тыс. исполнителей, и передача полного списка в
 * клиентский селект подвешивала страницу — вместо этого клиент ищет по
 * мере ввода. Ищет и по нику (name), и по реальному имени.
 */
/**
 * Ранжированный поиск: точные совпадения ника/имени → совпадения по
 * началу → просто contains. Без этого «tay» тонул в двадцати
 * «Amart-tay-akul» из-за алфавитной сортировки и take: 20. В подписи
 * вариантов показываем настоящее имя в скобках.
 */
async function rankedPerformerSearch(
  q: string,
  extra: Prisma.PerformerWhereInput,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  const select = { id: true, name: true, realName: true, photoUrl: true } as const;
  const nameFields = ["name", "realName", "musicAlias"] as const;

  const [exact, prefix, rest] = await Promise.all([
    prisma.performer.findMany({
      where: {
        ...extra,
        OR: nameFields.map((f) => ({ [f]: { equals: q, mode: "insensitive" } })),
      },
      select,
      orderBy: { name: "asc" },
      take: 20,
    }),
    prisma.performer.findMany({
      where: {
        ...extra,
        OR: nameFields.map((f) => ({ [f]: { startsWith: q, mode: "insensitive" } })),
      },
      select,
      orderBy: { name: "asc" },
      take: 20,
    }),
    prisma.performer.findMany({
      where: { ...extra, ...performerNameWhere(q) },
      select,
      orderBy: { name: "asc" },
      take: 20,
    }),
  ]);

  const seen = new Set<string>();
  const merged: typeof exact = [];
  for (const p of [...exact, ...prefix, ...rest]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p);
    if (merged.length >= 20) break;
  }
  return merged.map((p) => ({
    id: p.id,
    name: performerOptionLabel(p),
    photoUrl: p.photoUrl,
  }));
}

export async function searchPerformerOptions(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  await requireCatalogEditor();
  const q = query.trim();
  if (q.length < 2) return [];
  return rankedPerformerSearch(q, {});
}

/** То же, но только SOLO — для выбора участников группы и пейрингов. */
export async function searchSoloPerformerOptions(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  await requireCatalogEditor();
  const q = query.trim();
  if (q.length < 2) return [];
  return rankedPerformerSearch(q, { type: "SOLO" });
}

export async function findSimilarPerformers(
  query: string,
): Promise<{ id: string; name: string }[]> {
  await requireCatalogEditor();
  const q = query.trim();
  if (q.length < 2) return [];

  return prisma.performer.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 5,
  });
}

function parseType(raw: string): "SOLO" | "BAND" | "MASCOT" {
  return raw === "BAND" ? "BAND" : raw === "MASCOT" ? "MASCOT" : "SOLO";
}

function getMascotOwnerData(formData: FormData) {
  const performerIds = Array.from(
    new Set(formData.getAll("mascotPerformerIds").map(String).filter(Boolean)),
  );
  const pairingIds = Array.from(
    new Set(formData.getAll("mascotPairingIds").map(String).filter(Boolean)),
  );
  return [
    ...performerIds.map((performerId) => ({ performerId })),
    ...pairingIds.map((pairingId) => ({ pairingId })),
  ];
}

async function createPerformerRecord(name: string, type: string) {
  if (!name) throw new Error("Укажите имя исполнителя или группы");

  const performer = await prisma.performer.create({
    data: { name, type: parseType(type) },
  });

  revalidatePath("/admin/performers");
  revalidatePath("/artists");

  return performer;
}

export async function createPerformerAndReturn(
  name: string,
): Promise<{ id: string; name: string; type: string }> {
  await requireCatalogEditor();
  const performer = await createPerformerRecord(name.trim(), "SOLO");
  return { id: performer.id, name: performer.name, type: performer.type };
}

export async function deletePerformer(id: string) {
  await requireCatalogEditor();
  const existing = await prisma.performer.findUnique({ where: { id }, select: { name: true } });
  await prisma.performer.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "Performer",
    entityId: id,
    entityLabel: existing?.name ?? id,
  });
  revalidatePath("/admin/performers");
  revalidatePath("/artists");
  redirect("/admin/performers");
}

type LinkInput = { label: string; url: string };

// Instagram/TikTok/Twitter get their own named fields in the form
// (SOCIAL_PLATFORM_LABELS gives each its display label) — merged back into
// the same PerformerLink rows as the free-form list below on save, so the
// dedicated fields are purely a form-UI distinction, not a schema one.
const SOCIAL_FIELD_NAMES: Record<SocialPlatform, string> = {
  instagram: "instagramUrl",
  tiktok: "tiktokUrl",
  twitter: "twitterUrl",
  spotify: "spotifyUrl",
  applemusic: "applemusicUrl",
  youtube: "youtubeUrl",
};

function getLinks(formData: FormData): LinkInput[] {
  const links: LinkInput[] = [];

  for (const platform of Object.keys(SOCIAL_FIELD_NAMES) as SocialPlatform[]) {
    const url = String(formData.get(SOCIAL_FIELD_NAMES[platform]) ?? "").trim();
    if (url) links.push({ label: SOCIAL_PLATFORM_LABELS[platform], url });
  }

  const labels = formData.getAll("linkLabel").map(String);
  const urls = formData.getAll("linkUrl").map(String);
  for (let i = 0; i < Math.max(labels.length, urls.length); i++) {
    const label = (labels[i] ?? "").trim();
    const url = (urls[i] ?? "").trim();
    if (!url) continue; // skip empty rows / rows missing a url
    links.push({ label: label || url, url });
  }
  // Один и тот же профиль мог прийти и из отдельного поля Instagram, и
  // из общего списка ссылок — храним по одной записи на адрес.
  const seen = new Set<string>();
  return links.filter((l) => {
    const key = socialLinkKey(l.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseBirthDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getMemberIds(formData: FormData): string[] {
  const ids = formData.getAll("memberIds").map(String).filter(Boolean);
  return Array.from(new Set(ids));
}

function getDramaIds(formData: FormData): string[] {
  const ids = formData.getAll("dramaIds").map(String).filter(Boolean);
  return Array.from(new Set(ids));
}

function getEventIds(formData: FormData): string[] {
  const ids = formData.getAll("eventIds").map(String).filter(Boolean);
  return Array.from(new Set(ids));
}

function getAgencyIds(formData: FormData): string[] {
  const ids = formData.getAll("agencyIds").map(String).filter(Boolean);
  return Array.from(new Set(ids));
}

/**
 * Full performer creation: profile fields + links, same shape as the edit
 * form. Solo performers can optionally be paired with an existing performer
 * right away; band performers can have their member roster set right away.
 * Redirects to the new performer's edit page so the admin can continue
 * (mydramalist import, more links, etc.) without a second lookup.
 */
/** Поля профиля музыканта (приходят импортом с tpop.fandom, но теперь
 *  правятся и руками): списки — через запятую, «факты»/«клипы» — по
 *  строке на пункт. */
function getMusicProfileFields(formData: FormData) {
  const csv = (key: string) =>
    String(formData.get(key) ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const lines = (key: string) =>
    String(formData.get(key) ?? "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  const text = (key: string) => String(formData.get(key) ?? "").trim() || null;

  return {
    occupation: csv("occupation"),
    instruments: csv("instruments"),
    soloDebut: text("soloDebut"),
    height: text("height"),
    weight: text("weight"),
    mvAppearances: lines("mvAppearances"),
    trivia: lines("trivia"),
  };
}

export async function createPerformer(formData: FormData) {
  await requireCatalogEditor();
  const name = String(formData.get("name") ?? "").trim();
  const type = parseType(String(formData.get("type") ?? "SOLO"));
  const realName = String(formData.get("realName") ?? "").trim();
  const musicAlias = String(formData.get("musicAlias") ?? "").trim();
  const alsoKnownAs = String(formData.get("alsoKnownAs") ?? "").trim();
  const nationality = String(formData.get("nationality") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const birthDate = parseBirthDate(String(formData.get("birthDate") ?? ""));
  const placeOfBirth = String(formData.get("placeOfBirth") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const agencyIds = getAgencyIds(formData);
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const links = getLinks(formData);

  if (!name) throw new Error("Укажите имя исполнителя или группы");

  const performer = await prisma.performer.create({
    data: {
      name,
      type,
      realName: realName || null,
      musicAlias: musicAlias || null,
      alsoKnownAs: alsoKnownAs || null,
      nationality: nationality || null,
      gender: gender || null,
      birthDate: type !== "BAND" ? birthDate : null,
      placeOfBirth: type === "SOLO" ? placeOfBirth || null : null,
      bio: bio || null,
      photoUrl: photoUrl || null,
      ...getMusicProfileFields(formData),
      links: {
        create: links.map((l) => ({ label: l.label, url: l.url })),
      },
      agencies: {
        create: agencyIds.map((agencyId) => ({ agencyId })),
      },
    },
  });

  if (type === "SOLO") {
    const partnerId = String(formData.get("pairingPartnerId") ?? "").trim();
    if (partnerId && partnerId !== performer.id) {
      const pairingName = String(formData.get("pairingName") ?? "").trim();
      const [performerAId, performerBId] = [performer.id, partnerId].sort();
      await prisma.pairing.create({
        data: { name: pairingName || null, performerAId, performerBId },
      });
    }

    const dramaIds = getDramaIds(formData);
    if (dramaIds.length > 0) {
      await prisma.performerDrama.createMany({
        data: dramaIds.map((dramaId) => ({ performerId: performer.id, dramaId })),
      });
    }
  } else if (type === "BAND") {
    const memberIds = getMemberIds(formData);
    if (memberIds.length > 0) {
      await prisma.bandMember.createMany({
        data: memberIds.map((performerId) => ({ bandId: performer.id, performerId })),
      });
    }
  } else {
    // MASCOT: привязка к «хозяевам» — актёрам и/или пейрингам.
    const owners = getMascotOwnerData(formData);
    if (owners.length > 0) {
      await prisma.mascotOwner.createMany({
        data: owners.map((o) => ({ mascotId: performer.id, ...o })),
      });
    }
  }

  const eventIds = getEventIds(formData);
  if (eventIds.length > 0) {
    await prisma.eventPerformer.createMany({
      data: eventIds.map((eventId) => ({ eventId, performerId: performer.id })),
    });
  }

  await logAudit({
    action: "CREATE",
    entityType: "Performer",
    entityId: performer.id,
    entityLabel: performer.name,
  });

  revalidatePath("/admin/performers");
  revalidatePath("/admin/pairings");
  revalidatePath("/artists");
  revalidatePath("/");
  redirect(`/admin/performers/${performer.id}/edit`);
}

/**
 * Какой раздел формы прислали. Вкладки формы исполнителя сохраняются
 * порознь, и правка одной не должна трогать остальные.
 *
 * Это не косметика: обновление сносит связи `deleteMany` и создаёт их
 * заново из присланного. Пока сохранялось всё разом, это было
 * безобидно — а с раздельными кнопками сохранение вкладки «Евенты»
 * стёрло бы и сериалы, и агентства, и ссылки. Поэтому раздел решает не
 * только что записать, но и что удалять.
 *
 * «all» — создание записи и любой старый вызов без пометки.
 */
type SaveScope = "all" | "general" | "dramas" | "events";

function parseScope(formData: FormData): SaveScope {
  const raw = String(formData.get("scope") ?? "all");
  return raw === "general" || raw === "dramas" || raw === "events" ? raw : "all";
}

export async function updatePerformer(id: string, formData: FormData) {
  await requireCatalogEditor();
  const scope = parseScope(formData);
  const saveGeneral = scope === "all" || scope === "general";
  const saveDramas = scope === "all" || scope === "dramas";
  const saveEvents = scope === "all" || scope === "events";
  const name = String(formData.get("name") ?? "").trim();
  const type = parseType(String(formData.get("type") ?? "SOLO"));
  const realName = String(formData.get("realName") ?? "").trim();
  const musicAlias = String(formData.get("musicAlias") ?? "").trim();
  const alsoKnownAs = String(formData.get("alsoKnownAs") ?? "").trim();
  const nationality = String(formData.get("nationality") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const birthDate = parseBirthDate(String(formData.get("birthDate") ?? ""));
  const placeOfBirth = String(formData.get("placeOfBirth") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const agencyIds = getAgencyIds(formData);
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const mydramalistUrl = String(formData.get("mydramalistUrl") ?? "").trim();
  const links = getLinks(formData);
  const memberIds = type === "BAND" ? getMemberIds(formData) : [];
  const dramaIds = type === "SOLO" ? getDramaIds(formData) : [];
  const eventIds = getEventIds(formData);

  if (saveGeneral && !name) throw new Error("Укажите имя исполнителя или группы");

  // Снимок до правки: история сравнивает его с тем, что ушло в update
  // (см. src/lib/audit.ts). Связи (агентства) берём отдельным списком id.
  const before = await prisma.performer.findUnique({
    where: { id },
    include: { agencies: { select: { agencyId: true } } },
  });

  // Вид записи решает, куда идут участники, сериалы и место рождения. С
  // вкладки «Евенты» поля вида не приходит, поэтому берём его из базы:
  // она тут источник правды, а не форма.
  const effectiveType = saveGeneral ? type : (before?.type ?? type);

  await prisma.$transaction([
    // Удаляем ровно то, что тут же создадим заново: чужие вкладки не
    // трогаем.
    ...(saveGeneral
      ? [
          prisma.performerLink.deleteMany({ where: { performerId: id } }),
          prisma.bandMember.deleteMany({ where: { bandId: id } }),
          prisma.mascotOwner.deleteMany({ where: { mascotId: id } }),
          prisma.performerAgency.deleteMany({ where: { performerId: id } }),
        ]
      : []),
    ...(saveDramas ? [prisma.performerDrama.deleteMany({ where: { performerId: id } })] : []),
    ...(saveEvents ? [prisma.eventPerformer.deleteMany({ where: { performerId: id } })] : []),
    prisma.performer.update({
      where: { id },
      data: {
        ...(saveGeneral
          ? {
              name,
              type,
              realName: realName || null,
              musicAlias: musicAlias || null,
              alsoKnownAs: alsoKnownAs || null,
              nationality: nationality || null,
              gender: gender || null,
              birthDate: type !== "BAND" ? birthDate : null,
              placeOfBirth: type === "SOLO" ? placeOfBirth || null : null,
              bio: bio || null,
              photoUrl: photoUrl || null,
              mydramalistUrl: mydramalistUrl || null,
              ...getMusicProfileFields(formData),
              links: {
                create: links.map((l) => ({ label: l.label, url: l.url })),
              },
              bandMembers: {
                create: memberIds.map((performerId) => ({ performerId })),
              },
              mascotOwners: {
                create: effectiveType === "MASCOT" ? getMascotOwnerData(formData) : [],
              },
              agencies: {
                create: agencyIds.map((agencyId) => ({ agencyId })),
              },
            }
          : {}),
        ...(saveDramas
          ? {
              dramas: {
                create: (effectiveType === "SOLO" ? dramaIds : []).map((dramaId) => ({ dramaId })),
              },
            }
          : {}),
        ...(saveEvents
          ? {
              events: {
                create: eventIds.map((eventId) => ({ eventId })),
              },
            }
          : {}),
      },
    }),
  ]);

  if (before && saveGeneral) {
    await logAudit({
      action: "UPDATE",
      entityType: "Performer",
      entityId: id,
      entityLabel: name,
      changes: diffRecords(
        { ...before, agencyIds: before.agencies.map((a) => a.agencyId).sort() },
        {
          name,
          type,
          realName,
          musicAlias,
          alsoKnownAs,
          nationality,
          gender,
          birthDate,
          placeOfBirth,
          bio,
          photoUrl,
          mydramalistUrl,
          agencyIds: [...agencyIds].sort(),
          ...getMusicProfileFields(formData),
        },
        [
          "name", "type", "realName", "musicAlias", "alsoKnownAs", "nationality",
          "gender", "birthDate", "placeOfBirth", "bio", "photoUrl", "mydramalistUrl",
          "agencyIds", "occupation", "instruments", "soloDebut", "height", "weight",
          "mvAppearances", "trivia",
        ],
      ),
    });
  }

  revalidatePath("/admin/performers");
  revalidatePath(`/admin/performers/${id}/edit`);
  revalidatePath("/artists");
  revalidatePath(`/performers/${id}`);
  revalidatePath("/");
  // Сохранение отдельной вкладки оставляет на странице БЕЗ редиректа:
  // он сбросил бы скролл и активную вкладку. Профиль тоже больше не
  // уводит в список (просьба владельца: правка не закрывает страницу)
  // — назад на свою же форму с отметкой «Сохранено».
  if (saveGeneral) redirect(`/admin/performers/${id}/edit?saved=1`);
}

