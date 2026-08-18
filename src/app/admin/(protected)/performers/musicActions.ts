"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";

// Альбомы и песни исполнителя раньше появлялись только через импорт с
// tpop.fandom — руками ни добавить, ни поправить. Эти экшены питают
// вкладку «Музыка» на странице редактирования исполнителя.

function parseYear(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n > 1900 && n < 2100 ? n : null;
}

export async function saveAlbum(performerId: string, formData: FormData): Promise<void> {
  await requireCatalogEditor();
  const id = String(formData.get("albumId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Введите название альбома");
  const data = {
    title,
    type: String(formData.get("type") ?? "ALBUM") === "EP" ? ("EP" as const) : ("ALBUM" as const),
    year: parseYear(formData.get("year")),
    url: String(formData.get("url") ?? "").trim() || null,
    coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
  };

  if (id) {
    await prisma.album.update({ where: { id }, data });
  } else {
    // (performerId, title) уникальны — повторное добавление обновляет.
    await prisma.album.upsert({
      where: { performerId_title: { performerId, title } },
      create: { performerId, ...data },
      update: data,
    });
  }
  revalidatePath(`/admin/performers/${performerId}/edit`);
}

export async function deleteAlbum(performerId: string, albumId: string): Promise<void> {
  await requireCatalogEditor();
  await prisma.album.delete({ where: { id: albumId } });
  revalidatePath(`/admin/performers/${performerId}/edit`);
}

export async function saveSong(performerId: string, formData: FormData): Promise<void> {
  await requireCatalogEditor();
  const id = String(formData.get("songId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Введите название песни");
  const albumId = String(formData.get("albumId") ?? "").trim() || null;
  const data = {
    title,
    note: String(formData.get("note") ?? "").trim() || null,
    year: parseYear(formData.get("year")),
    url: String(formData.get("url") ?? "").trim() || null,
    albumId,
  };

  if (id) {
    await prisma.song.update({ where: { id }, data });
  } else {
    await prisma.song.create({ data: { performerId, ...data } });
  }
  revalidatePath(`/admin/performers/${performerId}/edit`);
}

export async function deleteSong(performerId: string, songId: string): Promise<void> {
  await requireCatalogEditor();
  await prisma.song.delete({ where: { id: songId } });
  revalidatePath(`/admin/performers/${performerId}/edit`);
}
