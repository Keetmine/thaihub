import AppLink from "@/components/AppLink";
import { translatedText } from "@/lib/entityTranslations";
import ScrollableTabs from "@/components/ScrollableTabs";
import SourcesBlock from "@/components/SourcesBlock";
import BackLink from "@/components/BackLink";
import DetailHero from "@/components/DetailHero";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import DramaStatusButton from "@/components/DramaStatusButton";
import NameSearchBox from "@/components/NameSearchBox";
import { getDramaWatchStatuses } from "@/lib/favorites";
import { DRAMA_STATUS_BADGE_CLASS } from "@/lib/dramaStatus";
import { performerHref } from "@/lib/performerSlug";
import { dramaHref } from "@/lib/dramaSlug";
import { compareDramaTitles, dramaTitleForLocale } from "@/lib/dramaLocale";
import { agencyHref, slugOrIdWhere } from "@/lib/slugHelpers";
import { pageMetadata, JsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import SocialLinkIcons from "@/components/SocialLinkIcons";
import { detectSocialPlatform, type SocialPlatform } from "@/lib/socialLinks";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getT();
  const agency = await prisma.agency.findFirst({
    where: slugOrIdWhere(id),
    // translations — ради русского описания в мете (см. entityTranslations).
    select: { name: true, description: true, logoUrl: true, slug: true, translations: true },
  });
  if (!agency)
    return pageMetadata({
      title: t.catalog.agency.metaTitle,
      description: t.catalog.agency.metaNotFound,
    });
  return pageMetadata({
    title: agency.name,
    description:
      translatedText(agency, "description", agency.description, locale)?.slice(0, 160) ??
      t.catalog.agency.metaDescription(agency.name),
    path: `/agencies/${agency.slug ?? id}`,
    image: agency.logoUrl,
  });
}


export const dynamic = "force-dynamic";

export default async function AgencyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { t, locale } = await getT();
  const [{ id: rawParam }, { tab: rawTab, q: rawQ }] = await Promise.all([
    params,
    searchParams,
  ]);
  const tab = rawTab === "dramas" ? "dramas" : "performers";
  const q = (rawQ ?? "").trim();

  const agency = await prisma.agency.findFirst({
    where: slugOrIdWhere(rawParam),
    include: {
      performers: { include: { performer: true }, orderBy: { performer: { name: "asc" } } },
      dramas: { orderBy: { title: "asc" } },
      links: true,
    },
  });

  if (!agency) notFound();
  // Русский текст записи: перевод, если он есть, иначе оригинал.
  const description = translatedText(agency, "description", agency.description, locale);
  const id = agency.id;
  const href = agencyHref(agency);

  const allPerformers = agency.performers.map((pa) => pa.performer);
  // Поиск — только внутри этого агентства: фильтруем уже загруженный
  // ростер/фильмографию (это десятки записей, не каталог).
  const needle = q.toLowerCase();
  const performers = q
    ? allPerformers.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.realName ?? "").toLowerCase().includes(needle),
      )
    : allPerformers;
  // Название — на языке зрителя (русское с dorama.land, если есть):
  // порядок и поиск тоже по нему, иначе на /ru «Узел» искался бы только
  // как «Knot» и стоял бы под «K».
  const allDramas = [...agency.dramas].sort((a, b) => compareDramaTitles(a, b, locale));
  const dramas = q
    ? allDramas.filter((d) => dramaTitleForLocale(d, locale).toLowerCase().includes(needle))
    : allDramas;

  const currentUser = await getCurrentUser();
  let isFavorited = false;
  const favoritedPerformerIds = new Set<string>();
  if (currentUser) {
    const [favorite, favPerformers] = await Promise.all([
      prisma.favoriteAgency.findUnique({
        where: { userId_agencyId: { userId: currentUser.id, agencyId: id } },
      }),
      allPerformers.length > 0
        ? prisma.favoritePerformer.findMany({
            where: {
              userId: currentUser.id,
              performerId: { in: allPerformers.map((p) => p.id) },
            },
            select: { performerId: true },
          })
        : Promise.resolve([]),
    ]);
    isFavorited = !!favorite;
    for (const f of favPerformers) favoritedPerformerIds.add(f.performerId);
  }
  const statusByDramaId = await getDramaWatchStatuses(
    agency.dramas.map((d) => d.id),
    currentUser?.id,
  );

  // Ссылки агентства делятся так же, как у артистов: узнанные соцсети —
  // иконками, остальное — кнопками с подписью.
  const socialItems = agency.links
    .map((l) => {
      const platform = detectSocialPlatform(l.url);
      return platform ? { platform, url: l.url } : null;
    })
    .filter((item): item is { platform: SocialPlatform; url: string } => !!item);
  const otherLinks = agency.links.filter((l) => !detectSocialPlatform(l.url));

  return (
    <div>
      <BackLink
        fallbackHref="/artists?view=agencies"
        fallbackLabel={t.catalog.agency.back}
      />

      {/* Иммерсивный hero как у новелл (просьба владельца): лого фоном
          с блюром и зерном, а рядом с названием — круглой карточкой
          (photoShape="circle": портретная 3/4 резала квадратное лого,
          у GMMTV «GMM» превращалось в «MM»). */}
      <div className="mt-3">
        <DetailHero
          photoUrl={agency.logoUrl}
          photoAlt={agency.name}
          photoShape="circle"
          title={agency.name}
          footer={
            (socialItems.length > 0 || otherLinks.length > 0) && (
              <div className="d-flex flex-wrap align-items-center gap-2 mt-1">
                <SocialLinkIcons items={socialItems} />
                {otherLinks.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline-secondary btn-sm"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )
          }
          chips={
            <>
              {allPerformers.length > 0 && (
                <span className="date-chip">
                  {t.catalog.agency.artistCount(allPerformers.length)}
                </span>
              )}
              {agency.dramas.length > 0 && (
                <span className="date-chip">
                  {t.catalog.agency.seriesCount(agency.dramas.length)}
                </span>
              )}
            </>
          }
          actions={
            <FavoriteButton kind="agency" id={agency.id} isFavorited={isFavorited} variant="icon" />
          }
        />
      </div>

      {/* Лого переехало в hero — тут осталось только описание. */}
      {description && (
        <p className="text-secondary mb-4" style={{ maxWidth: "40rem" }}>
          {description}
        </p>
      )}

      <div className="tab-bar-row">
        <ScrollableTabs>
          <AppLink
            href={q ? `${href}?q=${encodeURIComponent(q)}` : href}
            prefetch={false}
            className={`tab-bar-item ${tab === "performers" ? "active" : ""}`}
          >
            {t.catalog.agency.tabArtists(allPerformers.length)}
          </AppLink>
          <AppLink
            href={`${href}?tab=dramas${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            prefetch={false}
            className={`tab-bar-item ${tab === "dramas" ? "active" : ""}`}
          >
            {t.catalog.agency.tabSeries(agency.dramas.length)}
          </AppLink>
        </ScrollableTabs>
        <NameSearchBox
          action={href}
          q={q}
          hiddenFields={tab === "dramas" ? { tab } : undefined}
          placeholder={
            tab === "dramas" ? t.catalog.searchByTitle : t.catalog.searchByName
          }
          className=""
        />
      </div>

      {tab === "performers" ? (
        performers.length === 0 ? (
          <p className="small text-secondary mb-4">
            {q ? t.common.nobodyFound : t.catalog.agency.emptyArtists}
          </p>
        ) : (
          // Компактная сетка карточек (как постеры сериалов на странице
          // актёра) вместо списка на всю ширину — исполнителей у агентства
          // бывает много, а в строке была только аватарка и имя.
          <div className="d-flex flex-wrap gap-3 mb-4">
            {performers.map((p) => (
              <div
                key={p.id}
                className="flex-shrink-0"
                style={{ width: "8.5rem", position: "relative" }}
              >
                <AppLink href={performerHref(p)} className="text-decoration-none d-block">
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: "0.5rem",
                      background: "var(--bs-secondary-bg)",
                      overflow: "hidden",
                    }}
                  >
                    {p.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        decoding="async"
                        src={p.photoUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    )}
                  </div>
                  <p className="small text-white mb-0 mt-2" style={{ lineHeight: 1.3 }}>
                    {p.name}
                  </p>
                  {p.realName && (
                    <p className="small text-secondary mb-0" style={{ lineHeight: 1.3 }}>
                      ({p.realName})
                    </p>
                  )}
                </AppLink>
                <div className="position-absolute" style={{ top: "0.375rem", right: "0.375rem" }}>
                  <FavoriteButton
                    kind="performer"
                    id={p.id}
                    isFavorited={favoritedPerformerIds.has(p.id)}
                    variant="icon"
                  />
                </div>
              </div>
            ))}
          </div>
        )
      ) : dramas.length === 0 ? (
        <p className="small text-secondary">
          {q ? t.common.nothingFound : t.catalog.agency.emptySeries}
        </p>
      ) : (
        // Тот же формат постер-карточек, что и в фильмографии актёра.
        <div className="d-flex flex-wrap gap-3">
          {dramas.map((d) => (
            <div
              key={d.id}
              className="flex-shrink-0"
              style={{ width: "8.5rem", position: "relative" }}
            >
              <AppLink href={dramaHref(d)} className="text-decoration-none d-block">
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "2 / 3",
                    borderRadius: "0.5rem",
                    background: "var(--bs-secondary-bg)",
                    overflow: "hidden",
                  }}
                >
                  {d.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      loading="lazy"
                      decoding="async"
                      src={d.posterUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}
                  {d.status === "RETURNING_SERIES" && (
                    <span
                      // Подложка — общая для бейджей поверх постера
                      // (см. .poster-status-badge в globals.css).
                      className={`badge rounded-pill poster-status-badge ${DRAMA_STATUS_BADGE_CLASS.RETURNING_SERIES}`}
                      style={{ position: "absolute", top: "0.375rem", left: "0.375rem", fontSize: "0.6rem" }}
                    >
                      {t.catalog.dramaStatus.RETURNING_SERIES}
                    </span>
                  )}
                </div>
                <p className="small text-white mb-0 mt-2" style={{ lineHeight: 1.3 }}>
                  {dramaTitleForLocale(d, locale)}
                </p>
                {d.year && <p className="small text-secondary mb-0">{d.year}</p>}
              </AppLink>
              <div className="position-absolute" style={{ top: "0.375rem", right: "0.375rem" }}>
                <DramaStatusButton
                  dramaId={d.id}
                  status={statusByDramaId.get(d.id)?.status ?? null}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Атрибуция: состав/описание агентства пришли из открытых
          источников (Wikipedia/fandom/сайт агентства) — см. /terms. */}
      <SourcesBlock links={[{ url: agency.sourceUrl }]} />
      {/* Крошки: ступень раздела повторяет ссылку-возврат вверху
          страницы — агентства живут вкладкой в каталоге артистов. */}
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: t.catalog.breadcrumb.home, path: "/" },
            {
              name: t.catalog.breadcrumb.agencies,
              path: "/artists?view=agencies",
            },
            {
              name: agency.name,
              path: `/agencies/${agency.slug ?? rawParam}`,
            },
          ],
          locale,
        )}
      />
    </div>
  );
}
