"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/slug";
import { logAudit, diffRecords } from "@/lib/audit";
import { sanitizeWikiHtml } from "./wikiSanitize";

function getFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Укажите заголовок статьи");
  return {
    title,
    // Чистим на входе, а не только на рендере: в базе не должно лежать
    // ничего, что нельзя отдать наружу (см. wikiSanitize.ts — почему
    // «только админы» не аргумент).
    content: sanitizeWikiHtml(String(formData.get("content") ?? "")),
    published: String(formData.get("published") ?? "") === "on",
  };
}

/** Слаг из заголовка с нумерацией при совпадении: статьи открываются по
 *  /wiki/kak-kupit-bilety, а не по cuid. Пустой (заголовок без латиницы
 *  и кириллицы) означает «слага нет» — ссылка откатится на id. */
async function uniqueWikiSlug(title: string, exceptId?: string): Promise<string | null> {
  const base = slugify(title);
  if (!base) return null;
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await prisma.wikiArticle.findUnique({ where: { slug: candidate } });
    if (!taken || taken.id === exceptId) return candidate;
  }
  return null;
}

function revalidateWiki(slugOrId?: string) {
  revalidatePath("/admin/wiki");
  if (slugOrId) revalidatePath(`/wiki/${slugOrId}`);
}

export async function createWikiArticle(formData: FormData) {
  await requireAdmin();
  const fields = getFields(formData);
  const article = await prisma.wikiArticle.create({
    data: { ...fields, slug: await uniqueWikiSlug(fields.title) },
  });
  await logAudit({
    action: "CREATE",
    entityType: "WikiArticle",
    entityId: article.id,
    entityLabel: article.title,
  });
  revalidateWiki();
  redirect(`/admin/wiki/${article.id}/edit`);
}

export async function updateWikiArticle(id: string, formData: FormData) {
  await requireAdmin();
  const fields = getFields(formData);
  const before = await prisma.wikiArticle.findUnique({ where: { id } });
  const article = await prisma.wikiArticle.update({
    where: { id },
    data: {
      ...fields,
      // Слаг перегенерируем, только если его ещё нет: у опубликованной
      // статьи он уже разошёлся ссылками.
      ...(before?.slug ? {} : { slug: await uniqueWikiSlug(fields.title, id) }),
    },
  });
  if (before) {
    await logAudit({
      action: "UPDATE",
      entityType: "WikiArticle",
      entityId: id,
      entityLabel: article.title,
      changes: diffRecords(before, fields, ["title", "content", "published"]),
    });
  }
  revalidateWiki(article.slug ?? article.id);
  redirect("/admin/wiki");
}

export async function deleteWikiArticle(id: string) {
  await requireAdmin();
  const existing = await prisma.wikiArticle.findUnique({ where: { id }, select: { title: true } });
  await prisma.wikiArticle.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    entityType: "WikiArticle",
    entityId: id,
    entityLabel: existing?.title ?? id,
  });
  revalidateWiki();
  // Правка не закрывает страницу (просьба владельца): назад на
  // свою же форму с отметкой «Сохранено».
  redirect(`/admin/wiki/${id}/edit?saved=1`);
}

// Массовые действия для BulkList в /admin/wiki. Точечные экшены пишут
// историю правок — массовые тоже, но одной строкой BULK: иначе разом
// снятые с публикации статьи не оставили бы следа.

/** Короткая сводка для истории: первые пять заголовков и «ещё N».
 *  Свой экземпляр, а не общий из bulkActions.ts: там таблица каталожных
 *  сущностей, вики в неё не входит. */
function summarize(titles: string[]): string {
  const head = titles.slice(0, 5).join(", ");
  return titles.length > 5 ? `${head} и ещё ${titles.length - 5}` : head;
}

async function wikiTitles(ids: string[]): Promise<string[]> {
  const rows = await prisma.wikiArticle.findMany({
    where: { id: { in: ids } },
    select: { title: true },
  });
  return rows.map((r) => r.title);
}

export async function bulkDeleteWikiArticles(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  const titles = await wikiTitles(ids);
  await prisma.wikiArticle.deleteMany({ where: { id: { in: ids } } });
  await logAudit({
    action: "BULK",
    entityType: "WikiArticle",
    // У массового действия нет одной записи-владельца — id первой строки
    // нужен только ссылке, смысл несёт note.
    entityId: ids[0],
    entityLabel: `${ids.length} статей`,
    note: `удалено: ${summarize(titles)}`,
  });
  revalidateWiki();
  revalidatePath("/wiki");
}

/** Опубликовать выбранные или вернуть их в черновики. Значение приходит
 *  строкой из <select> панели, поэтому сверяем его сами. */
export async function bulkSetWikiPublished(ids: string[], value: string): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  if (value !== "publish" && value !== "draft") throw new Error("Неизвестное действие");
  const published = value === "publish";
  const articles = await prisma.wikiArticle.findMany({
    where: { id: { in: ids } },
    select: { title: true, slug: true, id: true },
  });
  await prisma.wikiArticle.updateMany({ where: { id: { in: ids } }, data: { published } });
  await logAudit({
    action: "BULK",
    entityType: "WikiArticle",
    entityId: ids[0],
    entityLabel: `${ids.length} статей`,
    note: `${published ? "опубликовано" : "снято с публикации"}: ${summarize(
      articles.map((a) => a.title),
    )}`,
  });
  revalidatePath("/admin/wiki");
  // Индекс /wiki показывает только опубликованные — его сбрасываем
  // всегда, страницы самих статей поимённо.
  revalidatePath("/wiki");
  for (const a of articles) revalidatePath(`/wiki/${a.slug ?? a.id}`);
}
