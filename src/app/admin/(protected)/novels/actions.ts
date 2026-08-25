"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { logAudit, diffRecords } from "@/lib/audit";
import { parseFicbookPage, fetchFicbookHtml, fetchOriginalCover } from "@/lib/ficbook";
import { downloadRemoteImage } from "@/lib/localImage";
import { logImportRun } from "@/lib/importRun";

function getLinks(formData: FormData): { label: string; url: string }[] {
  const labels = formData.getAll("linkLabel").map(String);
  const urls = formData.getAll("linkUrl").map(String);
  const links: { label: string; url: string }[] = [];
  for (let i = 0; i < Math.max(labels.length, urls.length); i++) {
    const url = (urls[i] ?? "").trim();
    if (!url) continue;
    links.push({ label: (labels[i] ?? "").trim() || url, url });
  }
  return links;
}

function getDramaIds(formData: FormData): string[] {
  return Array.from(new Set(formData.getAll("dramaIds").map(String).filter(Boolean)));
}

function getFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Укажите название новеллы");
  return {
    title,
    author: String(formData.get("author") ?? "").trim() || null,
    coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    originalAuthor: String(formData.get("originalAuthor") ?? "").trim() || null,
    size: String(formData.get("size") ?? "").trim() || null,
    tags: String(formData.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

function revalidateNovelPaths(id?: string) {
  revalidatePath("/novels");
  revalidatePath("/admin/novels");
  if (id) revalidatePath(`/novels/${id}`);
}

export async function createNovel(formData: FormData) {
  await requireCatalogEditor();
  const fields = getFields(formData);
  const created = await prisma.novel.create({
    data: {
      ...fields,
      links: { create: getLinks(formData) },
      dramas: { connect: getDramaIds(formData).map((id) => ({ id })) },
    },
  });
  await logAudit({
    action: "CREATE",
    entityType: "Novel",
    entityId: created.id,
    entityLabel: created.title,
  });
  revalidateNovelPaths();
  redirect("/admin/novels");
}

export async function updateNovel(id: string, formData: FormData) {
  await requireCatalogEditor();
  const fields = getFields(formData);
  const before = await prisma.novel.findUnique({ where: { id } });
  await prisma.$transaction([
    prisma.novelLink.deleteMany({ where: { novelId: id } }),
    prisma.drama.updateMany({ where: { novelId: id }, data: { novelId: null } }),
    prisma.novel.update({
      where: { id },
      data: {
        ...fields,
        links: { create: getLinks(formData) },
        dramas: { connect: getDramaIds(formData).map((dId) => ({ id: dId })) },
      },
    }),
  ]);
  if (before) {
    await logAudit({
      action: "UPDATE",
      entityType: "Novel",
      entityId: id,
      entityLabel: String(fields.title ?? before.title),
      changes: diffRecords(before, fields, Object.keys(fields)),
    });
  }
  revalidateNovelPaths(id);
  redirect("/admin/novels");
}

export async function deleteNovel(id: string) {
  await requireCatalogEditor();
  const existing = await prisma.novel.findUnique({ where: { id }, select: { title: true } });
  await prisma.novel.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "Novel",
    entityId: id,
    entityLabel: existing?.title ?? id,
  });
  revalidateNovelPaths(id);
  redirect("/admin/novels");
}

/** Async-поиск для комбобокса «Новелла» в форме сериала. */
export async function searchNovelOptions(
  query: string,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  await requireCatalogEditor();
  const q = query.trim();
  if (q.length < 2) return [];
  const novels = await prisma.novel.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { author: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, title: true, coverUrl: true },
    orderBy: { title: "asc" },
    take: 20,
  });
  return novels.map((n) => ({ id: n.id, name: n.title, photoUrl: n.coverUrl }));
}

/** Inline-создание из комбобокса формы сериала. */
export async function createNovelAndReturn(
  title: string,
): Promise<{ id: string; title: string }> {
  await requireCatalogEditor();
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Укажите название новеллы");
  const novel = await prisma.novel.create({ data: { title: trimmed } });
  revalidateNovelPaths();
  return { id: novel.id, title: novel.title };
}

/**
 * Импорт новеллы со страницы Фикбука: название, описание, автор
 * (переводчик), автор оригинала, ссылка на оригинал, бейджи+метки,
 * размер; обложка — og:image со страницы оригинала (у Фикбука своих
 * нет). Создаёт новеллу с двумя ссылками (Фикбук, Оригинал) и ведёт на
 * редактирование. Сайт за JS-проверкой — см. src/lib/ficbook.ts.
 */
export async function importNovelFromFicbook(url: string): Promise<{ id: string }> {
  await requireCatalogEditor();
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Вставьте ссылку на Фикбук");

  const fic = await logImportRun(
    "ficbook-novel",
    async () => parseFicbookPage(await fetchFicbookHtml(trimmed), trimmed),
    (f) => f.title,
  );
  // null — прогон остановили из админки (см. logImportRun).
  if (!fic) throw new Error("Импорт остановлен");

  let coverUrl: string | null = null;
  if (fic.originalUrl) {
    const remote = await fetchOriginalCover(fic.originalUrl);
    if (remote) coverUrl = await downloadRemoteImage(remote, "novels");
  }

  const novel = await prisma.novel.create({
    data: {
      title: fic.title,
      author: fic.author,
      originalAuthor: fic.originalAuthor,
      description: fic.description,
      tags: fic.tags,
      size: fic.size,
      coverUrl,
      links: {
        create: [
          { label: "Фикбук", url: trimmed },
          ...(fic.originalUrl ? [{ label: "Оригинал", url: fic.originalUrl }] : []),
        ],
      },
    },
  });
  revalidateNovelPaths(novel.id);
  return { id: novel.id };
}
