import ReviewsAndComments from "@/components/ReviewsAndComments";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/BackLink";
import DetailHero from "@/components/DetailHero";
import SourcesBlock from "@/components/SourcesBlock";
import EntityMiniCard from "@/components/EntityMiniCard";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { UserIcon } from "@/components/icons";
import { pageMetadata, JsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import { cache } from "react";

// React.cache: generateMetadata и страница делят ОДИН запрос на
// HTTP-запрос (как getCurrentUser в lib/userAuth.ts) — раньше метадата
// ходила в базу отдельным узким select.
const getNovel = cache(async (rawId: string) =>
  prisma.novel.findFirst({
    where: slugOrIdWhere(rawId),
    include: { links: true, dramas: true },
  }),
);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getT();
  const novel = await getNovel(id);
  // notFound() именно здесь: метадата считается до флаша ответа, и
  // несуществующий slug получает настоящий HTTP 404 — иначе loading.tsx
  // успевал отдать 200-shell до notFound() в самой странице (soft-404).
  if (!novel) notFound();
  return pageMetadata({
    title: novel.title,
    description:
      novel.description?.slice(0, 160) ??
      t.catalog.novel.metaDescription(
        `${novel.title}${novel.author ? ` — ${novel.author}` : ""}`,
      ),
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
  const { t, locale } = await getT();
  // Тот же React.cache-запрос, что и в generateMetadata, — Prisma
  // дёргается один раз на HTTP-запрос.
  const novel = await getNovel(rawId);
  if (!novel) notFound();

  return (
    <div>
      <BackLink fallbackHref="/novels" fallbackLabel={t.catalog.novel.back} />
      {/* Иммерсивный hero (Э2): обложка размытым фоном вместо прежней
          колонки с обложкой; автор и число экранизаций — чипами. */}
      <div className="mt-3">
        <DetailHero
          photoUrl={novel.coverUrl}
          photoAlt={novel.title}
          title={novel.title}
          chips={
            <>
              {novel.author && (
                <span className="date-chip">{novel.author}</span>
              )}
              {novel.dramas.length > 0 && (
                <span className="date-chip">
                  {t.catalog.novel.adaptationCount(novel.dramas.length)}
                </span>
              )}
            </>
          }
        />
      </div>

      {/* Факты и описание — свой блок, как на странице артиста;
          автор ушёл чипом в hero. */}
      {(novel.tags.length > 0 ||
        novel.originalAuthor ||
        novel.size ||
        novel.description) && (
        <div className="surface p-4 mb-4">
          {novel.tags.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mb-3">
              {novel.tags.slice(0, 16).map((t) => (
                <span key={t} className="event-chip">{t}</span>
              ))}
            </div>
          )}
          {novel.originalAuthor && (
            <p className="small text-secondary mb-2">
              <UserIcon className="icon-inline" />{" "}
              <span className="text-secondary">{t.catalog.novel.originalAuthor}</span>{" "}
              {novel.originalAuthor}
            </p>
          )}
          {novel.size && (
            <p className="small text-secondary mb-2">
              <span className="text-secondary">{t.catalog.novel.size}</span> {novel.size}
            </p>
          )}
          {novel.description && (
            <p className="text-secondary mb-0" style={{ whiteSpace: "pre-line" }}>
              {novel.description}
            </p>
          )}
        </div>
      )}

      {novel.links.length > 0 && (
        <>
          <h2 className="section-heading mb-2">{t.catalog.novel.whereToRead}</h2>
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
          <h2 className="section-heading mb-2">{t.catalog.novel.adaptations}</h2>
          <div className="d-flex flex-wrap gap-2">
            {novel.dramas.map((d) => (
              <EntityMiniCard
                key={d.id}
                href={dramaHref(d)}
                photoUrl={d.posterUrl}
                name={dramaTitleForLocale(d, locale)}
                subtitle={d.year ? String(d.year) : undefined}
                round={false}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-4">
        <ReviewsAndComments kind="novel" id={novel.id} />
      </div>
      {/* Атрибуция — ВСЕГДА самым нижним блоком страницы (просьба
          владельца), после отзывов и комментариев. Описание, автор,
          теги и размер пришли со страницы на Фикбуке (см. /terms:
          источники обещаны на страницах записей); подпись — hostname.
          У новелл, заведённых вручную без ссылки, блок не рисуется. */}
      <SourcesBlock links={[{ url: novel.ficbookUrl }]} />
      {/* Крошки: ступень раздела повторяет ссылку-возврат вверху
          страницы (адрес и подпись), последняя ступень — сама запись. */}
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: t.catalog.breadcrumb.home, path: "/" },
            { name: t.catalog.breadcrumb.novels, path: "/novels" },
            {
              name: novel.title,
              path: `/novels/${novel.slug ?? rawId}`,
            },
          ],
          locale,
        )}
      />
    </div>
  );
}
