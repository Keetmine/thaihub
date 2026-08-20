import { prisma } from "@/lib/prisma";
import { downloadRemoteImage } from "@/lib/localImage";
import {
  fetchYtmArtist,
  albumUrl,
  songUrl,
  channelUrl,
  type YtmArtist,
} from "@/lib/youtubeMusic";

// Импорт дискографии с YouTube Music в карточку исполнителя: релизы,
// песни и ссылки на них. Идемпотентен — повторный прогон обновляет
// существующие записи и добавляет новые, поэтому его можно гонять по
// расписанию (см. src/instrumentation.ts).

export type YtmImportSummary = {
  performerName: string;
  albumsCreated: number;
  albumsUpdated: number;
  songsCreated: number;
  songsUpdated: number;
  linkAdded: boolean;
  /** Что появилось нового — для раздела «Что нового». */
  newTitles: string[];
};

const ALBUM_TYPE_BY_KIND: Record<string, "ALBUM" | "EP" | "SINGLE"> = {
  ep: "EP",
  single: "SINGLE",
};

/** «Single» на странице — это сингл, а не альбом: у нас для него есть
 *  свой тип, и в карточке они выводятся по-разному. */
function albumType(kind: string | null): "ALBUM" | "EP" | "SINGLE" {
  const key = kind?.trim().toLowerCase() ?? "";
  return ALBUM_TYPE_BY_KIND[key] ?? "ALBUM";
}

/**
 * Заливает дискографию артиста в его карточку.
 *
 * Сопоставление по названию: у релизов есть уникальность
 * (performerId + title), поэтому повторный импорт не плодит дубли, а
 * дополняет — например, проставляет обложку и ссылку тому, что завели
 * руками.
 */
export async function importYtmForPerformer(
  performerId: string,
  channelId: string,
  fetched?: YtmArtist,
): Promise<YtmImportSummary> {
  const artist = fetched ?? (await fetchYtmArtist(channelId));

  const performer = await prisma.performer.findUnique({
    where: { id: performerId },
    include: { links: true, albums: true, songs: true },
  });
  if (!performer) throw new Error("Исполнитель не найден");

  const summary: YtmImportSummary = {
    performerName: performer.name,
    albumsCreated: 0,
    albumsUpdated: 0,
    songsCreated: 0,
    songsUpdated: 0,
    linkAdded: false,
    newTitles: [],
  };

  // Ссылка на канал — если её ещё нет. Существующую не трогаем: у
  // артиста мог быть указан другой, более точный канал.
  const hasYoutubeLink = performer.links.some((l) => /youtube\.com/i.test(l.url));
  if (!hasYoutubeLink) {
    await prisma.performerLink.create({
      data: { performerId, label: "YouTube Music", url: channelUrl(channelId) },
    });
    summary.linkAdded = true;
  }

  for (const album of artist.albums) {
    const existing = performer.albums.find(
      (a) => a.title.trim().toLowerCase() === album.title.trim().toLowerCase(),
    );
    // Обложку скачиваем себе: ссылки на googleusercontent живут не вечно
    // и не открываются из РФ без прокси.
    const coverUrl =
      existing?.coverUrl ??
      (album.coverUrl ? await downloadRemoteImage(album.coverUrl, "albums").catch(() => null) : null);

    if (existing) {
      await prisma.album.update({
        where: { id: existing.id },
        data: {
          year: existing.year ?? album.year,
          coverUrl: existing.coverUrl ?? coverUrl,
          url: existing.url ?? albumUrl(album.browseId),
          type: existing.type ?? albumType(album.kind),
        },
      });
      summary.albumsUpdated += 1;
    } else {
      await prisma.album.create({
        data: {
          performerId,
          title: album.title,
          type: albumType(album.kind),
          year: album.year,
          coverUrl,
          url: albumUrl(album.browseId),
        },
      });
      summary.albumsCreated += 1;
      summary.newTitles.push(album.title);
    }
  }

  for (const song of artist.songs) {
    const existing = performer.songs.find(
      (s) => s.title.trim().toLowerCase() === song.title.trim().toLowerCase(),
    );
    // Песня часто выходит одноимённым синглом — тогда привязываем её к
    // этому релизу, чтобы в карточке не было двух несвязанных строк.
    const album = await prisma.album.findFirst({
      where: { performerId, title: { equals: song.title, mode: "insensitive" } },
      select: { id: true, year: true },
    });

    if (existing) {
      await prisma.song.update({
        where: { id: existing.id },
        data: {
          url: existing.url ?? songUrl(song.videoId),
          albumId: existing.albumId ?? album?.id ?? null,
          year: existing.year ?? album?.year ?? null,
        },
      });
      summary.songsUpdated += 1;
    } else {
      await prisma.song.create({
        data: {
          performerId,
          title: song.title,
          url: songUrl(song.videoId),
          albumId: album?.id ?? null,
          year: album?.year ?? null,
        },
      });
      summary.songsCreated += 1;
      // Одноимённый сингл уже попал в новинки как релиз — второй раз в
      // ленте он не нужен.
      if (!album) summary.newTitles.push(song.title);
    }
  }

  return summary;
}

/** Канал YouTube из ссылок исполнителя — для обновления по расписанию. */
export function channelIdFromLinks(links: { url: string }[]): string | null {
  for (const l of links) {
    const m = l.url.match(/channel\/(UC[\w-]{20,})/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Суточный обход всех исполнителей со ссылкой на канал YouTube.
 * Запускается по расписанию (см. src/instrumentation.ts): дискография
 * пополняется сама, а появившееся новое попадает в раздел «Что нового».
 *
 * Идёт последовательно с паузой: это не документированный API, и
 * долбить его сотней параллельных запросов — верный способ получить
 * блокировку.
 */
export async function refreshAllYoutubeMusic(options?: {
  limit?: number;
  delayMs?: number;
  /** Проверять только этих артистов — список задаётся в расписании
   *  (/admin/schedule). null или пусто = всех со ссылкой на канал. */
  performerIds?: string[] | null;
}): Promise<{ checked: number; updated: number; failed: number; newTitles: string[] }> {
  const performers = await prisma.performer.findMany({
    where: {
      links: { some: { url: { contains: "youtube.com/channel/" } } },
      ...(options?.performerIds?.length ? { id: { in: options.performerIds } } : {}),
    },
    select: { id: true, name: true, links: { select: { url: true } } },
    take: options?.limit ?? 200,
  });

  let updated = 0;
  let failed = 0;
  const newTitles: string[] = [];

  for (const performer of performers) {
    const channelId = channelIdFromLinks(performer.links);
    if (!channelId) continue;
    try {
      const summary = await importYtmForPerformer(performer.id, channelId);
      if (summary.albumsCreated > 0 || summary.songsCreated > 0) {
        updated += 1;
        newTitles.push(...summary.newTitles.map((t) => `${performer.name} — ${t}`));
      }
    } catch (err) {
      failed += 1;
      console.warn(
        `youtube-music refresh failed for ${performer.name}: ${err instanceof Error ? err.message : err}`,
      );
    }
    await new Promise((r) => setTimeout(r, options?.delayMs ?? 1500));
  }

  return { checked: performers.length, updated, failed, newTitles };
}
