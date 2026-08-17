import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/BackLink";
import { slugOrIdWhere } from "@/lib/slugHelpers";

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
