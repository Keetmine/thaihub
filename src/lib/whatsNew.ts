import type { AlbumType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// «Что нового» — свежие релизы и песни, появившиеся в каталоге.
// Наполняется в основном суточным обходом YouTube Music
// (см. lib/youtubeMusicImport.ts), но берётся из самих Album/Song, а не
// из отдельного журнала: так в ленту попадает и то, что завели руками.

export type NewsItem = {
  id: string;
  kind: "album" | "song";
  title: string;
  /** Тип релиза: сингл, EP, альбом — у песен пусто. Наружу идёт код, а
   *  не подпись: язык знает страница, модуль остаётся про данные. */
  albumType: AlbumType | null;
  year: number | null;
  coverUrl: string | null;
  url: string | null;
  addedAt: Date;
  performer: { id: string; name: string; slug: string | null; photoUrl: string | null };
};

/**
 * Последние музыкальные новинки. `favoritedBy` сужает выборку до
 * артистов, которых человек добавил себе, — лента «моих» новостей
 * интереснее общей.
 */
export async function getMusicNews(options?: {
  limit?: number;
  userId?: string | null;
  onlyFavorites?: boolean;
}): Promise<NewsItem[]> {
  const limit = options?.limit ?? 12;
  const performerWhere =
    options?.onlyFavorites && options.userId
      ? { favoritedBy: { some: { userId: options.userId } } }
      : {};

  const performerSelect = {
    select: { id: true, name: true, slug: true, photoUrl: true },
  } as const;

  const [albums, songs] = await Promise.all([
    prisma.album.findMany({
      where: { performer: performerWhere },
      select: {
        id: true,
        title: true,
        type: true,
        year: true,
        coverUrl: true,
        url: true,
        createdAt: true,
        performer: performerSelect,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.song.findMany({
      // Песни, вышедшие отдельным синглом, уже показаны релизом — в
      // ленте нужны только самостоятельные.
      where: { performer: performerWhere, albumId: null },
      select: {
        id: true,
        title: true,
        year: true,
        url: true,
        createdAt: true,
        performer: performerSelect,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const items: NewsItem[] = [
    ...albums.map((a) => ({
      id: a.id,
      kind: "album" as const,
      title: a.title,
      albumType: a.type,
      year: a.year,
      coverUrl: a.coverUrl,
      url: a.url,
      addedAt: a.createdAt,
      performer: a.performer,
    })),
    ...songs.map((s) => ({
      id: s.id,
      kind: "song" as const,
      title: s.title,
      albumType: null,
      year: s.year,
      coverUrl: null,
      url: s.url,
      addedAt: s.createdAt,
      performer: s.performer,
    })),
  ];

  return items.sort((a, b) => +b.addedAt - +a.addedAt).slice(0, limit);
}

/** «У сериала появились места съёмок» — вторая половина ленты «что
 *  нового» (просьба владельца 2026-09-06). Считается по дате привязки
 *  места к сериалу (`DramaLocation.createdAt`), а не по дате самой
 *  локации: одно кафе переиспользуется разными сериалами, и новостью
 *  становится именно привязка. Локации одного сериала за прогон
 *  склеиваются в ОДНУ строку — иначе пятнадцать мест «You Maniac»
 *  вытеснили бы из ленты всё остальное. */
export type LocationNewsItem = {
  /** Тот же id — под именем `id` его ждут помощники ссылок и локали
   *  (dramaHref, dramaTitleForLocale). */
  id: string;
  dramaId: string;
  title: string;
  slug: string | null;
  titleRu: string | null;
  posterUrl: string | null;
  /** Сколько мест привязано в этой пачке. */
  count: number;
  addedAt: Date;
};

/** Окно новизны: привязки старше месяца новостью уже не выглядят, а
 *  без окна счётчик пачки склеивал бы места, добавленные в разные дни. */
const LOCATION_NEWS_DAYS = 30;

export async function getLocationNews(limit = 6): Promise<LocationNewsItem[]> {
  const since = new Date(Date.now() - LOCATION_NEWS_DAYS * 24 * 60 * 60 * 1000);
  // Берём хвост свежих привязок и группируем в памяти: групповых
  // запросов с сортировкой по максимуму даты у Prisma нет, а строк тут
  // десятки.
  const rows = await prisma.dramaLocation.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: limit * 40,
    select: {
      createdAt: true,
      drama: { select: { id: true, title: true, titleRu: true, slug: true, posterUrl: true } },
    },
  });

  const byDrama = new Map<string, LocationNewsItem>();
  for (const row of rows) {
    const cur = byDrama.get(row.drama.id);
    if (cur) {
      cur.count += 1;
      if (row.createdAt > cur.addedAt) cur.addedAt = row.createdAt;
      continue;
    }
    byDrama.set(row.drama.id, {
      id: row.drama.id,
      dramaId: row.drama.id,
      title: row.drama.title,
      titleRu: row.drama.titleRu,
      slug: row.drama.slug,
      posterUrl: row.drama.posterUrl,
      count: 1,
      addedAt: row.createdAt,
    });
  }

  return [...byDrama.values()].sort((a, b) => +b.addedAt - +a.addedAt).slice(0, limit);
}
