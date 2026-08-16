"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { syncAllDramasFromTmdb, type DramaSyncSummary } from "@/lib/tmdbImport";
import { fetchMdlDrama } from "@/lib/mydramalist";
import { downloadRemoteImage } from "@/lib/localImage";
import { requireAdmin } from "@/lib/auth";

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
  await requireAdmin();
  const q = query.trim();
  if (q.length < 2) return [];

  const dramas = await prisma.drama.findMany({
    where: { title: { contains: q, mode: "insensitive" } },
    select: { id: true, title: true, posterUrl: true },
    orderBy: { title: "asc" },
    take: 20,
  });
  return dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }));
}

export async function findSimilarDramas(query: string): Promise<{ id: string; name: string }[]> {
  await requireAdmin();
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

export async function createDrama(formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const posterUrl = String(formData.get("posterUrl") ?? "").trim();
  const synopsis = String(formData.get("synopsis") ?? "").trim();
  const mydramalistUrl = String(formData.get("mydramalistUrl") ?? "").trim();
  const agencyId = String(formData.get("agencyId") ?? "").trim();
  const year = getYear(formData);
  const cast = getCastEntries(formData);
  const locationIds = getLocationIds(formData);

  if (!title) {
    throw new Error("Укажите название сериала");
  }

  await prisma.drama.create({
    data: {
      title,
      year,
      posterUrl: posterUrl || null,
      synopsis: synopsis || null,
      mydramalistUrl: mydramalistUrl || null,
      agencyId: agencyId || null,
      performers: {
        create: cast.map((c) => ({ performerId: c.performerId, role: c.role })),
      },
      locations: {
        create: locationIds.map((locationId) => ({ locationId })),
      },
    },
  });

  revalidateDramaPaths();
  redirect("/admin/dramas");
}

export async function updateDrama(id: string, formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const posterUrl = String(formData.get("posterUrl") ?? "").trim();
  const synopsis = String(formData.get("synopsis") ?? "").trim();
  const mydramalistUrl = String(formData.get("mydramalistUrl") ?? "").trim();
  const agencyId = String(formData.get("agencyId") ?? "").trim();
  const year = getYear(formData);
  const cast = getCastEntries(formData);
  const locationIds = getLocationIds(formData);

  if (!title) {
    throw new Error("Укажите название сериала");
  }

  await prisma.$transaction([
    prisma.performerDrama.deleteMany({ where: { dramaId: id } }),
    prisma.dramaLocation.deleteMany({ where: { dramaId: id } }),
    prisma.drama.update({
      where: { id },
      data: {
        title,
        year,
        posterUrl: posterUrl || null,
        synopsis: synopsis || null,
        mydramalistUrl: mydramalistUrl || null,
        agencyId: agencyId || null,
        performers: {
          create: cast.map((c) => ({ performerId: c.performerId, role: c.role })),
        },
        locations: {
          create: locationIds.map((locationId) => ({ locationId })),
        },
      },
    }),
  ]);

  revalidateDramaPaths(id);
  redirect("/admin/dramas");
}

/** Inline-create from a performer form's dramas combobox — title only. */
export async function createDramaAndReturn(
  title: string,
): Promise<{ id: string; title: string; posterUrl: string | null }> {
  await requireAdmin();
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Укажите название сериала");

  const drama = await prisma.drama.create({ data: { title: trimmed } });
  revalidateDramaPaths();
  return { id: drama.id, title: drama.title, posterUrl: drama.posterUrl };
}

export async function deleteDrama(id: string) {
  await requireAdmin();
  await prisma.drama.delete({ where: { id } });
  revalidateDramaPaths(id);
  redirect("/admin/dramas");
}

/**
 * Sweeps every drama in the catalog through TMDB (see
 * `syncAllDramasFromTmdb` for matching/dedup details) — the admin-UI
 * counterpart to `scripts/sync-dramas-tmdb.ts`, same underlying sweep.
 */
export async function syncTmdbDramas(): Promise<DramaSyncSummary> {
  await requireAdmin();
  const result = await syncAllDramasFromTmdb();
  revalidateDramaPaths();
  return result;
}

export type MdlImportSummary = {
  filled: string[];
  skipped: string[];
};

/**
 * Подтягивает данные сериала со страницы MyDramaList (см.
 * `src/lib/mydramalist.ts`) по ссылке из поля mydramalistUrl. Пустые
 * поля заполняются, занятые не трогаются (кроме статуса — он всегда
 * освежается, т.к. выводится из дат эфира). Постер скачивается локально
 * в WebP, как и все картинки в проекте.
 */
export async function importFromMydramalist(id: string, url: string): Promise<MdlImportSummary> {
  await requireAdmin();
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Сначала укажите ссылку на MyDramaList");

  const drama = await prisma.drama.findUnique({ where: { id } });
  if (!drama) throw new Error("Сериал не найден");

  const mdl = await fetchMdlDrama(trimmed);

  const filled: string[] = [];
  const skipped: string[] = [];
  const data: Record<string, unknown> = { mydramalistUrl: trimmed };

  if (!drama.synopsis && mdl.synopsis) {
    data.synopsis = mdl.synopsis;
    filled.push("описание");
  } else if (drama.synopsis) skipped.push("описание");

  if (!drama.year && mdl.year) {
    data.year = mdl.year;
    filled.push("год");
  } else if (drama.year) skipped.push("год");

  if (!drama.network && mdl.network) {
    data.network = mdl.network;
    filled.push("канал");
  } else if (drama.network) skipped.push("канал");

  if (!drama.posterUrl && mdl.posterUrl) {
    data.posterUrl = await downloadRemoteImage(mdl.posterUrl, "mdl");
    filled.push("постер");
  } else if (drama.posterUrl) skipped.push("постер");

  if (mdl.status && mdl.status !== drama.status) {
    data.status = mdl.status;
    filled.push("статус");
  }

  await prisma.drama.update({ where: { id }, data });
  revalidateDramaPaths(id);
  return { filled, skipped };
}
