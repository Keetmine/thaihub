"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function getFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Укажите заголовок статьи");
  return {
    title,
    content: String(formData.get("content") ?? ""),
    published: String(formData.get("published") ?? "") === "on",
  };
}

function revalidateWiki(slugOrId?: string) {
  revalidatePath("/admin/wiki");
  if (slugOrId) revalidatePath(`/wiki/${slugOrId}`);
}

export async function createWikiArticle(formData: FormData) {
  await requireAdmin();
  const article = await prisma.wikiArticle.create({ data: getFields(formData) });
  revalidateWiki();
  redirect(`/admin/wiki/${article.id}/edit`);
}

export async function updateWikiArticle(id: string, formData: FormData) {
  await requireAdmin();
  const article = await prisma.wikiArticle.update({ where: { id }, data: getFields(formData) });
  revalidateWiki(article.slug ?? article.id);
  redirect("/admin/wiki");
}

export async function deleteWikiArticle(id: string) {
  await requireAdmin();
  await prisma.wikiArticle.delete({ where: { id } });
  revalidateWiki();
  redirect("/admin/wiki");
}
