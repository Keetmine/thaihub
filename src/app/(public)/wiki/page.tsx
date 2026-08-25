import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/seo";
import { formatShortDate } from "@/lib/dates";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.wiki.metaTitle,
    description: t.wiki.metaDescription,
    path: "/wiki",
    locale,
  });
}

// Индекс вики: все опубликованные статьи. Доступен без логина (как и
// сами статьи) — ссылка живёт в футере.
export default async function WikiIndexPage() {
  const { locale, t } = await getT();
  const articles = await prisma.wikiArticle.findMany({
    where: { published: true },
    select: { id: true, slug: true, title: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div style={{ maxWidth: "44rem" }}>
      <PageHeader eyebrow={t.wiki.eyebrow} title={t.wiki.title} size="lg" className="mb-5" />
      <p className="text-secondary mb-4">{t.wiki.intro}</p>

      {articles.length === 0 ? (
        <EmptyState emoji="📚" title={t.wiki.emptyTitle} hint={t.wiki.emptyHint} compact />
      ) : (
        <div className="d-flex flex-column gap-2">
          {articles.map((a) => (
            <AppLink
              key={a.id}
              href={`/wiki/${a.slug ?? a.id}`}
              className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <span className="font-display fw-medium text-white">{a.title}</span>
              <span className="small text-secondary flex-shrink-0">
                {formatShortDate(a.updatedAt, locale)} {a.updatedAt.getUTCFullYear()}
              </span>
            </AppLink>
          ))}
        </div>
      )}
    </div>
  );
}
