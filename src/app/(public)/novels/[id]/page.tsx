import ReviewsAndComments from "@/components/ReviewsAndComments";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/BackLink";
import EntityMiniCard from "@/components/EntityMiniCard";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import { dramaHref } from "@/lib/dramaSlug";
import { UserIcon } from "@/components/icons";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const novel = await prisma.novel.findFirst({
    where: slugOrIdWhere(id),
    select: { title: true, description: true, coverUrl: true, author: true, slug: true },
  });
  if (!novel) return pageMetadata({ title: "Новелла", description: "Новелла не найдена." });
  return pageMetadata({
    title: novel.title,
    description:
      novel.description?.slice(0, 160) ??
      `${novel.title}${novel.author ? ` — ${novel.author}` : ""}: описание новеллы и её экранизации.`,
    path: `/novels/${novel.slug ?? id}`,
    image: novel.coverUrl,
    type: "article",
  });
}


export const dynamic = "force-dynamic";

export default async function NovelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const novel = await prisma.novel.findFirst({
    where: slugOrIdWhere(rawId),
    include: { links: true, dramas: true },
  });
  if (!novel) notFound();

  return (
    <div>
      <BackLink fallbackHref="/novels" fallbackLabel="← Все новеллы" />
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        {novel.title}
      </h1>

      <div className="row g-4">
        {novel.coverUrl && (
          <div className="col-12 col-sm-4 col-md-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              decoding="async"
              src={novel.coverUrl}
              alt={novel.title}
              className="surface"
              style={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover" }}
            />
          </div>
        )}
        <div className={novel.coverUrl ? "col-12 col-sm-8 col-md-9" : "col-12"}>
          {novel.tags.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mb-3">
              {novel.tags.slice(0, 16).map((t) => (
                <span key={t} className="event-chip">{t}</span>
              ))}
            </div>
          )}
          {novel.author && (
            <p className="small text-secondary mb-2">
              <UserIcon className="icon-inline" />{" "}
              <span className="text-secondary">Автор:</span> {novel.author}
            </p>
          )}
          {novel.originalAuthor && (
            <p className="small text-secondary mb-2">
              <UserIcon className="icon-inline" />{" "}
              <span className="text-secondary">Автор оригинала:</span> {novel.originalAuthor}
            </p>
          )}
          {novel.size && (
            <p className="small text-secondary mb-2">
              <span className="text-secondary">Размер:</span> {novel.size}
            </p>
          )}
          {novel.description && (
            <p className="text-secondary mb-3" style={{ whiteSpace: "pre-line" }}>
              {novel.description}
            </p>
          )}

          {novel.links.length > 0 && (
            <>
              <h2 className="section-heading mb-2">Где почитать</h2>
              <div className="d-flex flex-wrap gap-2 mb-4">
                {novel.links.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    {l.label} ↗
                  </a>
                ))}
              </div>
            </>
          )}

          {novel.dramas.length > 0 && (
            <>
              <h2 className="section-heading mb-2">Экранизации</h2>
              <div className="d-flex flex-wrap gap-2">
                {novel.dramas.map((d) => (
                  <EntityMiniCard
                    key={d.id}
                    href={dramaHref(d)}
                    photoUrl={d.posterUrl}
                    name={d.title}
                    subtitle={d.year ? String(d.year) : undefined}
                    round={false}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4">
        <ReviewsAndComments kind="novel" id={novel.id} />
      </div>
    </div>
  );
}
