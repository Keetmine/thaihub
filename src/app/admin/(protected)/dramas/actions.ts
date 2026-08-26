"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { logAudit, diffRecords } from "@/lib/audit";
import type { DramaStatus } from "@/generated/prisma/client";
import { dramaTitleWhere } from "@/lib/searchWhere";

function getCastEntries(
  formData: FormData,
): { performerId: string; role: string | null }[] {
  const ids = formData.getAll("castPerformerIds").map(String);
  const roles = formData.getAll("castRole").map(String);

  const seen = new Set<string>();
  const entries: { performerId: string; role: string | null }[] = [];
  ids.forEach((id, i) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const role = (roles[i] ?? "").trim();
    entries.push({ performerId: id, role: role || null });
  });
  return entries;
}


function getCsv(formData: FormData, field: string): string[] {
  return String(formData.get(field) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const DRAMA_STATUSES = new Set([
  "PLANNED", "IN_PRODUCTION", "PILOT", "RETURNING_SERIES", "ENDED", "CANCELED",
]);

/** Общие поля формы сериала (create и update) — включая MDL-детали. */
function getDramaDetailFields(formData: FormData) {
  const str = (f: string) => String(formData.get(f) ?? "").trim();
  const num = (f: string) => {
    const raw = str(f);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  const statusRaw = str("status");
  return {
    nativeTitle: str("nativeTitle") || null,
    alsoKnownAs: str("alsoKnownAs") || null,
    director: str("director") || null,
    screenwriter: str("screenwriter") || null,
    genres: getCsv(formData, "genres"),
    tags: getCsv(formData, "tags"),
    episodes: num("episodes"),
    airedOn: str("airedOn") || null,
    duration: str("duration") || null,
    contentRating: str("contentRating") || null,
    network: str("network") || null,
    status: DRAMA_STATUSES.has(statusRaw) ? (statusRaw as DramaStatus) : null,
  };
}

function getYear(formData: FormData): number | null {
  const raw = String(formData.get("year") ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function getLocationIds(formData: FormData): string[] {
  return Array.from(new Set(formData.getAll("locationIds").map(String).filter(Boolean)));
}

function revalidateDramaPaths(id?: string) {
  revalidatePath("/admin/dramas");
  revalidatePath("/dramas");
  revalidatePath("/locations");
  if (id) revalidatePath(`/dramas/${id}`);
}

/** Live "похоже, уже есть" lookup for the create form's title field. */
/**
 * Асинхронный поиск для комбобоксов выбора сериала (EventForm,
 * PerformerForm, AgencyForm): каталог ~4.6 тыс. — полный список в
 * клиентском селекте не нужен, ищем на сервере по мере ввода.
 */
export async function searchDramaOptions(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  await requireCatalogEditor();
  const q = query.trim();
  if (q.length < 2) return [];

  // Точные/префиксные совпадения названия — вперёд (см. rankedPerformerSearch).
  const select = { id: true, title: true, posterUrl: true } as const;
  const [exact, prefix, rest] = await Promise.all([
    prisma.drama.findMany({
      where: { title: { equals: q, mode: "insensitive" } },
      select,
      take: 20,
    }),
    prisma.drama.findMany({
      where: { title: { startsWith: q, mode: "insensitive" } },
      select,
      orderBy: { title: "asc" },
      take: 20,
    }),
    prisma.drama.findMany({
      where: dramaTitleWhere(q),
      select,
      orderBy: { title: "asc" },
      take: 20,
    }),
  ]);
  const seen = new Set<string>();
  const merged: typeof exact = [];
  for (const d of [...exact, ...prefix, ...rest]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    merged.push(d);
    if (merged.length >= 20) break;
  }
  return merged.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }));
}

export async function findSimilarDramas(query: string): Promise<{ id: string; name: string }[]> {
  await requireCatalogEditor();
  const q = query.trim();
  if (q.length < 2) return [];

  const dramas = await prisma.drama.findMany({
    where: { title: { contains: q, mode: "insensitive" } },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
    take: 5,
  });
  return dramas.map((d) => ({ id: d.id, name: d.title }));
}

/** Агентства сериала: мультиселект отдаёт agencyIds, первое сохраняем и
 *  в легаси-поле agencyId (по нему всё ещё строится «Студия» на
 *  публичной странице), остальные — в DramaAgency. */
function getAgencyIds(formData: FormData): string[] {
  const many = formData.getAll("agencyIds").map(String).filter(Boolean);
  if (many.length > 0) return [...new Set(many)];
  const single = String(formData.get("agencyId") ?? "").trim();
  return single ? [single] : [];
}

export async function createDrama(formData: FormData) {
  await requireCatalogEditor();
  const title = String(formData.get("title") ?? "").trim();
  const posterUrl = String(formData.get("posterUrl") ?? "").trim();
  const synopsis = String(formData.get("synopsis") ?? "").trim();
  const mydramalistUrl = String(formData.get("mydramalistUrl") ?? "").trim();
  const agencyIds = getAgencyIds(formData);
  const novelId = String(formData.get("novelId") ?? "").trim();
  const year = getYear(formData);
  const cast = getCastEntries(formData);
  const locationIds = getLocationIds(formData);

  if (!title) {
    throw new Error("Укажите название сериала");
  }

  const created = await prisma.drama.create({
    data: {
      title,
      year,
      posterUrl: posterUrl || null,
      synopsis: synopsis || null,
      mydramalistUrl: mydramalistUrl || null,
      agencyId: agencyIds[0] ?? null,
      agencies: { create: agencyIds.map((agencyId) => ({ agencyId })) },
      novelId: novelId || null,
      ...getDramaDetailFields(formData),
      performers: {
        create: cast.map((c) => ({ performerId: c.performerId, role: c.role })),
      },
      locations: {
        create: locationIds.map((locationId) => ({ locationId })),
      },
    },
  });

  await logAudit({
    action: "CREATE",
    entityType: "Drama",
    entityId: created.id,
    entityLabel: created.title,
  });

  revalidateDramaPaths();
  redirect("/admin/dramas");
}

export async function updateDrama(id: string, formData: FormData) {
  await requireCatalogEditor();
  const title = String(formData.get("title") ?? "").trim();
  const posterUrl = String(formData.get("posterUrl") ?? "").trim();
  const synopsis = String(formData.get("synopsis") ?? "").trim();
  const mydramalistUrl = String(formData.get("mydramalistUrl") ?? "").trim();
  const agencyIds = getAgencyIds(formData);
  const novelId = String(formData.get("novelId") ?? "").trim();
  const year = getYear(formData);
  const cast = getCastEntries(formData);
  const locationIds = getLocationIds(formData);

  if (!title) {
    throw new Error("Укажите название сериала");
  }

  const before = await prisma.drama.findUnique({
    where: { id },
    include: { agencies: { select: { agencyId: true } } },
  });

  await prisma.$transaction([
    prisma.performerDrama.deleteMany({ where: { dramaId: id } }),
    prisma.dramaLocation.deleteMany({ where: { dramaId: id } }),
    prisma.dramaAgency.deleteMany({ where: { dramaId: id } }),
    prisma.drama.update({
      where: { id },
      data: {
        title,
        year,
        posterUrl: posterUrl || null,
        synopsis: synopsis || null,
        mydramalistUrl: mydramalistUrl || null,
        agencyId: agencyIds[0] ?? null,
        agencies: { create: agencyIds.map((agencyId) => ({ agencyId })) },
        novelId: novelId || null,
        ...getDramaDetailFields(formData),
        performers: {
          create: cast.map((c) => ({ performerId: c.performerId, role: c.role })),
        },
        locations: {
          create: locationIds.map((locationId) => ({ locationId })),
        },
      },
    }),
  ]);

  if (before) {
    await logAudit({
      action: "UPDATE",
      entityType: "Drama",
      entityId: id,
      entityLabel: title,
      changes: diffRecords(
        { ...before, agencyIds: before.agencies.map((a) => a.agencyId).sort() },
        {
          title,
          year,
          posterUrl,
          synopsis,
          mydramalistUrl,
          novelId,
          agencyIds: [...agencyIds].sort(),
          ...getDramaDetailFields(formData),
        },
        [
          "title", "year", "posterUrl", "synopsis", "mydramalistUrl", "novelId",
          "agencyIds", "status", "network", "episodes", "nativeTitle", "director",
          "screenwriter", "genres", "tags", "duration", "contentRating",
        ],
      ),
    });
  }

  revalidateDramaPaths(id);
  redirect("/admin/dramas");
}

/** Inline-create from a performer form's dramas combobox — title only. */
export async function createDramaAndReturn(
  title: string,
): Promise<{ id: string; title: string; posterUrl: string | null }> {
  await requireCatalogEditor();
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Укажите название сериала");

  const drama = await prisma.drama.create({ data: { title: trimmed } });
  revalidateDramaPaths();
  return { id: drama.id, title: drama.title, posterUrl: drama.posterUrl };
}

export async function deleteDrama(id: string) {
  await requireCatalogEditor();
  const existing = await prisma.drama.findUnique({ where: { id }, select: { title: true } });
  await prisma.drama.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "Drama",
    entityId: id,
    entityLabel: existing?.title ?? id,
  });
  revalidateDramaPaths(id);
  redirect("/admin/dramas");
}



