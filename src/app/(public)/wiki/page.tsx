import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Вики",
  description: "Гайды и полезные статьи для фанатов тайских BL-актёров: билеты, поездки, фанмиты.",
  path: "/wiki",
});

// Индекс вики: все опубликованные статьи. Доступен без логина (как и
// сами статьи) — ссылка живёт в футере.
export default async function WikiIndexPage() {
  const articles = await prisma.wikiArticle.findMany({
    where: { published: true },
    select: { id: true, slug: true, title: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div style={{ maxWidth: "44rem" }}>
      <PageHeader eyebrow="Полезное" title="Вики" size="lg" className="mb-5" />
      <p className="text-secondary mb-4">
        Гайды и статьи: как покупать билеты, куда лететь, что смотреть — всё,
        что пригодится фанату в одном месте.
      </p>

      {articles.length === 0 ? (
        <p className="text-secondary">Статьи скоро появятся.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {articles.map((a) => (
            <Link
              key={a.id}
              href={`/wiki/${a.slug ?? a.id}`}
              className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <span className="font-display fw-medium text-white">{a.title}</span>
              <span className="small text-secondary flex-shrink-0">
                {a.updatedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
