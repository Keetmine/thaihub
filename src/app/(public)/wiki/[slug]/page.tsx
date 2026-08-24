import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/BackLink";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await prisma.wikiArticle.findFirst({
    where: { ...slugOrIdWhere(slug), published: true },
    select: { title: true, content: true, slug: true },
  });
  if (!article) return pageMetadata({ title: "Статья", description: "Статья не найдена." });
  // Из HTML-содержимого выжимаем текст на описание.
  const text = article.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return pageMetadata({
    title: article.title,
    description:
      text.slice(0, 160) ||
      `${article.title}: пошаговый гайд для фанатов тайских BL-актёров.`,
    path: `/wiki/${article.slug ?? slug}`,
    type: "article",
  });
}


export const dynamic = "force-dynamic";

// Вики-статья: контент — HTML из админ-редактора (пишут только админы,
// поэтому dangerouslySetInnerHTML безопасен по построению).
export default async function WikiArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await prisma.wikiArticle.findFirst({
    where: { ...slugOrIdWhere(slug), published: true },
  });
  if (!article) notFound();

  return (
    <div style={{ maxWidth: "46rem" }}>
      <BackLink fallbackHref="/help" fallbackLabel="← Помощь" />
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        {article.title}
      </h1>
      <div className="wiki-content" dangerouslySetInnerHTML={{ __html: article.content }} />
    </div>
  );
}
