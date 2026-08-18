"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { logAudit, diffRecords } from "@/lib/audit";

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
    const before = await prisma.album.findUnique({ where: { id } });
    await prisma.album.update({ where: { id }, data });
    if (before) {
      await logAudit({
        action: "UPDATE",
        entityType: "Album",
        entityId: id,
        entityLabel: title,
        changes: diffRecords(before, data, Object.keys(data)),
        note: "правка через карточку исполнителя",
      });
    }
  } else {
    // (performerId, title) уникальны — повторное добавление обновляет.
    const album = await prisma.album.upsert({
      where: { performerId_title: { performerId, title } },
      create: { performerId, ...data },
      update: data,
    });
    await logAudit({
      action: "CREATE",
      entityType: "Album",
      entityId: album.id,
      entityLabel: title,
    });
  }
  revalidatePath(`/admin/performers/${performerId}/edit`);
}

export async function deleteAlbum(performerId: string, albumId: string): Promise<void> {
  await requireCatalogEditor();
  const existing = await prisma.album.findUnique({ where: { id: albumId }, select: { title: true } });
  await prisma.album.delete({ where: { id: albumId } });
  await logAudit({
    action: "DELETE",
    entityType: "Album",
    entityId: albumId,
    entityLabel: existing?.title ?? albumId,
  });
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
    const before = await prisma.song.findUnique({ where: { id } });
    await prisma.song.update({ where: { id }, data });
    if (before) {
      await logAudit({
        action: "UPDATE",
        entityType: "Song",
        entityId: id,
        entityLabel: title,
        changes: diffRecords(before, data, Object.keys(data)),
        note: "правка через карточку исполнителя",
      });
    }
  } else {
    const song = await prisma.song.create({ data: { performerId, ...data } });
    await logAudit({
      action: "CREATE",
      entityType: "Song",
      entityId: song.id,
      entityLabel: title,
    });
  }
  revalidatePath(`/admin/performers/${performerId}/edit`);
}

export async function deleteSong(performerId: string, songId: string): Promise<void> {
  await requireCatalogEditor();
  const existing = await prisma.song.findUnique({ where: { id: songId }, select: { title: true } });
  await prisma.song.delete({ where: { id: songId } });
  await logAudit({
    action: "DELETE",
    entityType: "Song",
    entityId: songId,
    entityLabel: existing?.title ?? songId,
  });
  revalidatePath(`/admin/performers/${performerId}/edit`);
}
