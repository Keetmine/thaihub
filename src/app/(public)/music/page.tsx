import { unstable_cache } from "next/cache";
import Link from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import FilterDisclosure from "@/components/filters/FilterDisclosure";
import FilterPanel from "@/components/filters/FilterPanel";
import MusicReleaseCard from "@/components/MusicReleaseCard";
import PageHeader from "@/components/PageHeader";
import { CATALOG_TAG } from "@/lib/catalogCache";
import {
  countActiveFilters,
  loadMusicFilterOptions,
  musicFilterDefs,
  musicFilterWhere,
  type FilterParams,
} from "@/lib/catalogFilters";
import { getT } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/userAuth";
import { countMusicNews, getMusicNews } from "@/lib/whatsNew";

// Витрина музыкальных релизов (дешёвое золото п.6): свежие альбомы и
// отдельные песни из каталога — то же, что лента «Что нового» на
// главной, только целой страницей, с фильтром «мои артисты» и колонкой
// фильтров справа, как в каталоге сериалов (просьба владельца
// 2026-09-10). Выборка общая — getMusicNews (src/lib/whatsNew.ts):
// «свежесть» здесь и на главной считается одинаково, витрина только
// накладывает поверх выбранный срез.

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.catalog.music.metaTitle,
    description: t.catalog.music.metaDescription,
    path: "/music",
  });
}

export const dynamic = "force-dynamic";

/** Пять десятков строк — примерно месяц пополнений каталога: витрина
 *  про «что нового», а не полная дискография (та — у артиста). Под
 *  фильтром показываем больше: человек уже сузил выборку сам, и
 *  обрезать её на полусотне значит спорить с ним. */
const RELEASES_SHOWN = 48;
const RELEASES_SHOWN_FILTERED = 120;

// Общая лента одинакова для всех — кэш, как у соседних каталогов
// (правка каталога сбрасывает тегом). Персональный фильтр «мои
// артисты» и любой выбранный срез считаются живым запросом: ключей по
// числу людей и сочетаний кэшу не надо.
const getLatestReleases = unstable_cache(
  async () => {
    const [items, total] = await Promise.all([
      getMusicNews({ limit: RELEASES_SHOWN }),
      countMusicNews(),
    ]);
    return { items, total };
  },
  ["music-latest-releases-v2"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

export default async function MusicPage({
  searchParams,
}: {
  searchParams: Promise<FilterParams>;
}) {
  const { t } = await getT();
  const params = await searchParams;
  const user = await getCurrentUser();
  // Фильтр только для залогиненного: у гостя избранного нет, и ссылка
  // ?filter=favorites у него молча показывает общую ленту.
  const onlyFavorites = params.filter === "favorites" && !!user;

  const options = await loadMusicFilterOptions();
  const defs = musicFilterDefs(t, options);
  const activeFilters = countActiveFilters(defs, params);
  const filter = musicFilterWhere(params);
  const limit = activeFilters > 0 ? RELEASES_SHOWN_FILTERED : RELEASES_SHOWN;

  const { items: releases, total } =
    activeFilters === 0 && !onlyFavorites
      ? // Из кэша даты приходят строками (значение сериализуется) — вернуть Date.
        await getLatestReleases().then((r) => ({
          ...r,
          items: r.items.map((i) => ({ ...i, addedAt: new Date(i.addedAt) })),
        }))
      : await (async () => {
          const query = { userId: user?.id, onlyFavorites, filter };
          const [items, count] = await Promise.all([
            getMusicNews({ ...query, limit }),
            countMusicNews(query),
          ]);
          return { items, total: count };
        })();

  // Переключатель «все / мои артисты» не должен ронять выбранный срез:
  // ссылки собираются из текущего адреса, а не из голого /music.
  const toggleHref = (favorites: boolean) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "filter") continue;
      if (typeof value === "string" && value) qs.set(key, value);
    }
    if (favorites) qs.set("filter", "favorites");
    return `/music${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        eyebrow={t.catalog.eyebrow}
        title={t.catalog.music.title}
        size="lg"
        className="mb-4"
        action={
          user && (
            // Тот же переключатель, что у «Выходит сегодня» на главной:
            // состояние в адресе — ссылкой можно поделиться, и без JS
            // работает.
            <span className="d-flex align-items-center gap-2 small">
              <Link
                href={toggleHref(false)}
                prefetch={false}
                className={onlyFavorites ? "text-secondary" : "text-white fw-medium"}
              >
                {t.catalog.music.all}
              </Link>
              <Link
                href={toggleHref(true)}
                prefetch={false}
                className={onlyFavorites ? "text-white fw-medium" : "text-secondary"}
              >
                {t.catalog.music.onlyFavorites}
              </Link>
            </span>
          )
        }
      />

      {/* Выдача слева, фильтры колонкой справа — как на /search и в
          админских списках. На телефоне колонка становится раскрывашкой
          над выдачей. */}
      <div className="row g-4">
        <div className="col-12 col-lg-9">
          {releases.length === 0 ? (
            activeFilters > 0 ? (
              <div>
                <p className="text-secondary mb-1">{t.filters.nothingMatched}</p>
                <p className="small text-secondary">{t.filters.resetAndRetry}</p>
              </div>
            ) : onlyFavorites ? (
              <EmptyState
                emoji="🎧"
                title={t.catalog.music.emptyFavoritesTitle}
                hint={t.catalog.music.emptyFavoritesHint}
                cta={{ href: "/artists", label: t.catalog.music.emptyFavoritesCta }}
                compact
              />
            ) : (
              <p className="text-secondary">{t.catalog.music.empty}</p>
            )
          ) : (
            <>
              <p className="text-secondary small mb-3">{t.filters.results(total)}</p>
              <div className="row g-2 stagger">
                {releases.map((item) => (
                  // По две в ряд, а не по три: колонка фильтров съела
                  // треть ширины, и в третях названия обрезались до
                  // «ไม่ได้ตั้…», а «Сингл · 2026» переносилось на две
                  // строки.
                  <div key={`${item.kind}-${item.id}`} className="col-12 col-md-6">
                    <MusicReleaseCard item={item} t={t} />
                  </div>
                ))}
              </div>
              {total > releases.length && (
                <p className="small text-secondary mt-3">
                  {t.catalog.music.shownFirst(releases.length)}
                </p>
              )}
            </>
          )}
        </div>
        <aside className="col-12 col-lg-3 order-first order-lg-last">
          <div className="d-lg-none">
            <FilterDisclosure
              title={`${t.filters.panelTitle}${activeFilters > 0 ? ` (${activeFilters})` : ""}`}
              defaultOpen={activeFilters > 0}
            >
              <FilterPanel defs={defs} />
            </FilterDisclosure>
          </div>
          <div className="d-none d-lg-block search-filter-aside">
            <p className="section-heading mb-3">{t.filters.panelTitle}</p>
            <FilterPanel defs={defs} />
          </div>
        </aside>
      </div>
    </div>
  );
}
