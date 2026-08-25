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
