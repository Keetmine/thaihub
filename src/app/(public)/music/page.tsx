import { unstable_cache } from "next/cache";
import Link from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import MusicReleaseCard from "@/components/MusicReleaseCard";
import PageHeader from "@/components/PageHeader";
import { CATALOG_TAG } from "@/lib/catalogCache";
import { getT } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/userAuth";
import { getMusicNews } from "@/lib/whatsNew";

// Витрина музыкальных релизов (дешёвое золото п.6): свежие альбомы и
// отдельные песни из каталога — то же, что лента «Что нового» на
// главной, только целой страницей и с фильтром «мои артисты». Выборка
// общая — getMusicNews (src/lib/whatsNew.ts): у витрины НЕТ своей
// логики отбора, чтобы «свежесть» считалась одинаково с главной.

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
 *  про «что нового», а не полная дискография (та — у артиста). */
const RELEASES_SHOWN = 48;

// Общая лента одинакова для всех — кэш, как у соседних каталогов
// (правка каталога сбрасывает тегом). Персональный фильтр «мои
// артисты» считается живым запросом: ключей по числу людей кэшу не надо.
const getLatestReleases = unstable_cache(
  async () => getMusicNews({ limit: RELEASES_SHOWN }),
  ["music-latest-releases"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

export default async function MusicPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { t } = await getT();
  const { filter } = await searchParams;
  const user = await getCurrentUser();
  // Фильтр только для залогиненного: у гостя избранного нет, и ссылка
  // ?filter=favorites у него молча показывает общую ленту.
  const onlyFavorites = filter === "favorites" && !!user;

  const releases = onlyFavorites
    ? await getMusicNews({ limit: RELEASES_SHOWN, userId: user!.id, onlyFavorites: true })
    : // Из кэша даты приходят строками (значение сериализуется) — вернуть Date.
      (await getLatestReleases()).map((i) => ({ ...i, addedAt: new Date(i.addedAt) }));

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
                href="/music"
                prefetch={false}
                className={onlyFavorites ? "text-secondary" : "text-white fw-medium"}
              >
                {t.catalog.music.all}
              </Link>
              <Link
                href="/music?filter=favorites"
                prefetch={false}
                className={onlyFavorites ? "text-white fw-medium" : "text-secondary"}
              >
                {t.catalog.music.onlyFavorites}
              </Link>
            </span>
          )
        }
      />

      {releases.length === 0 ? (
        onlyFavorites ? (
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
        <div className="row g-2 stagger">
          {releases.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="col-12 col-md-6 col-xl-4">
              <MusicReleaseCard item={item} t={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
