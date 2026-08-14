"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

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

export async function createDrama(formData: FormData) {
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
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Укажите название сериала");

  const drama = await prisma.drama.create({ data: { title: trimmed } });
  revalidateDramaPaths();
  return { id: drama.id, title: drama.title, posterUrl: drama.posterUrl };
}

export async function deleteDrama(id: string) {
  await prisma.drama.delete({ where: { id } });
  revalidateDramaPaths(id);
  redirect("/admin/dramas");
}
