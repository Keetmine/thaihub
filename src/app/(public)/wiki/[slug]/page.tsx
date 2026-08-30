import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/BackLink";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import { sanitizeWikiHtml } from "@/app/admin/(protected)/wiki/wikiSanitize";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { locale, t } = await getT();
  const article = await prisma.wikiArticle.findFirst({
    where: { ...slugOrIdWhere(slug), published: true },
    select: { title: true, content: true, slug: true },
  });
  if (!article) {
    return pageMetadata({
      title: t.wiki.article.metaTitle,
      description: t.wiki.article.metaNotFound,
      locale,
    });
  }
  // Из HTML-содержимого выжимаем текст на описание.
  const text = article.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return pageMetadata({
    title: article.title,
    description: text.slice(0, 160) || t.wiki.article.metaDescription(article.title),
    path: `/wiki/${article.slug ?? slug}`,
    type: "article",
    locale,
  });
}


export const dynamic = "force-dynamic";

// Вики-статья: контент — HTML из админ-редактора. Санитизируется и на
// сохранении (admin/wiki/actions.ts), и здесь на рендере: второй пояс
// прикрывает статьи, записанные в базу до появления санитайзера, — им
// не нужна миграция, чтобы стать безопасными.
export default async function WikiArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { t } = await getT();
  const article = await prisma.wikiArticle.findFirst({
    where: { ...slugOrIdWhere(slug), published: true },
  });
  if (!article) notFound();

  return (
    <div style={{ maxWidth: "46rem" }}>
      <BackLink fallbackHref="/help" fallbackLabel={t.wiki.article.back} />
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        {article.title}
      </h1>
      <div className="wiki-content" dangerouslySetInnerHTML={{ __html: sanitizeWikiHtml(article.content) }} />
    </div>
  );
}
