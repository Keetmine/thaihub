import type { AlbumType, Prisma } from "@/generated/prisma/client";
import type { MusicFilterWhere } from "@/lib/catalogFilters";
import { prisma } from "@/lib/prisma";
import { compareMusicNews } from "@/lib/musicOrder";

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

/** Насколько старым может быть релиз, чтобы считаться новинкой: этот
 *  год и прошлый. */
const MUSIC_NEWS_YEARS = 1;

/**
 * Последние музыкальные новинки. `favoritedBy` сужает выборку до
 * артистов, которых человек добавил себе, — лента «моих» новостей
 * интереснее общей.
 *
 * Новизна считается по ГОДУ РЕЛИЗА, а не по дате появления в каталоге
 * (правка владельца 2026-09-10). Иначе разбор нового артиста выкладывал
 * в «Новую музыку» его песни 2020 года: для сайта они свежие, для
 * человека — нет. Год у релиза известен всегда, точной даты в модели
 * нет, поэтому окно грубое, в годах.
 *
 * Песни без года из ленты выпадают: сказать «это новинка» про них
 * нечем, а показывать наугад — то же самое враньё, только тише.
 *
 * `filter` — срез витрины /music (musicFilterWhere в lib/catalogFilters).
 * Одно правило поверх него: если человек ВЫБРАЛ годы, окно свежести
 * снимается. Иначе фильтр «2019» отвечал бы пустотой — витрина спорила
 * бы с тем, что у неё же и спросили.
 */
/** Во сколько раз берём больше нужного из каждой таблицы: порядок
 *  считается в памяти (см. compareMusicNews), и запрос, отрезавший ровно
 *  `limit` по своему порядку, мог отсечь то, что после пересортировки
 *  должно стоять выше. Таблицы маленькие — сотни строк. */
const OVERFETCH = 4;

export async function getMusicNews(options?: {
  limit?: number;
  userId?: string | null;
  onlyFavorites?: boolean;
  filter?: MusicFilterWhere;
}): Promise<NewsItem[]> {
  const limit = options?.limit ?? 12;
  const where = musicWhere(options);

  const performerSelect = {
    select: { id: true, name: true, slug: true, photoUrl: true },
  } as const;

  const [albums, songs] = await Promise.all([
    where.albums
      ? prisma.album.findMany({
          where: { AND: where.albums },
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
          // Порядок и отбор считает compareMusicNews ниже — здесь
          // важно лишь не отрезать лишнего: берём с запасом, потому что
          // «свежие» по году и «свежие» по пачке — разные наборы.
          orderBy: [{ year: "desc" }, { createdAt: "desc" }],
          take: limit * OVERFETCH,
        })
      : [],
    where.songs
      ? prisma.song.findMany({
          where: { AND: where.songs },
          select: {
            id: true,
            title: true,
            year: true,
            url: true,
            createdAt: true,
            performer: performerSelect,
          },
          orderBy: [{ year: "desc" }, { createdAt: "desc" }],
          take: limit * OVERFETCH,
        })
      : [],
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

  // Порядок — общий compareMusicNews (src/lib/musicOrder.ts): год,
  // свежесть пачки импорта, место внутри пачки. Раньше здесь стояло
  // `addedAt desc`, и внутри одного прогона лента показывала релизы
  // задом наперёд — самый старый первым.
  return items.sort(compareMusicNews).slice(0, limit);
}

/** Сколько релизов под этим срезом всего — витрине нужно честное
 *  «Найдено: N», а не «показано столько, сколько влезло». */
export async function countMusicNews(options?: {
  userId?: string | null;
  onlyFavorites?: boolean;
  filter?: MusicFilterWhere;
}): Promise<number> {
  const where = musicWhere(options);
  const [albums, songs] = await Promise.all([
    where.albums ? prisma.album.count({ where: { AND: where.albums } }) : 0,
    where.songs ? prisma.song.count({ where: { AND: where.songs } }) : 0,
  ]);
  return albums + songs;
}

/** Общие условия выборки и счёта: список и счётчик обязаны считать одно
 *  и то же, поэтому склейка среза с окном свежести живёт в одном месте. */
function musicWhere(options?: {
  userId?: string | null;
  onlyFavorites?: boolean;
  filter?: MusicFilterWhere;
}): { albums: Prisma.AlbumWhereInput[] | null; songs: Prisma.SongWhereInput[] | null } {
  const filter = options?.filter;
  const base: (Prisma.AlbumWhereInput & Prisma.SongWhereInput)[] = [];

  if (options?.onlyFavorites && options.userId) {
    base.push({ performer: { favoritedBy: { some: { userId: options.userId } } } });
  }
  if (!filter?.yearPicked) {
    base.push({ year: { gte: new Date().getUTCFullYear() - MUSIC_NEWS_YEARS } });
  }

  return {
    albums: filter?.albums === null ? null : [...base, ...(filter?.albums ?? [])],
    // Песни, вышедшие отдельным синглом, уже показаны релизом — в
    // ленте нужны только самостоятельные.
    songs:
      filter?.songs === null ? null : [{ albumId: null }, ...base, ...(filter?.songs ?? [])],
  };
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
