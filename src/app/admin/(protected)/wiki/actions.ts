"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/slug";
import { logAudit, diffRecords } from "@/lib/audit";

function getFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Укажите заголовок статьи");
  return {
    title,
    content: String(formData.get("content") ?? ""),
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
  redirect("/admin/wiki");
}
