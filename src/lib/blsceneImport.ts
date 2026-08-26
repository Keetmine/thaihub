import type { Browser } from "playwright";
import { prisma } from "@/lib/prisma";
import {
  fetchBlsceneIndex,
  scrapeBlsceneDrama,
  resolveMapsCoords,
  type BlsceneDrama,
} from "@/lib/blscene";
import { checkImportCancelled } from "@/lib/importRun";
import { downloadRemoteImage } from "@/lib/localImage";

/** Фото локаций и постеры сериалов с blscene лежат у нас — одна плоская
 *  папка на источник, как у tmdb/mdl (см. «Local image storage» в
 *  docs/features/tmdb-import.md). Имена файлов у blscene длинные и
 *  уникальные, так что локации и постеры не сталкиваются. */
const FOLDER = "blscene";

/**
 * Постер пришёл со страницы локаций? Скачанный лежит в
 * `/uploads/blscene/…`, а если скачать не удалось — в поле остаётся
 * прямая ссылка на blscene.com.
 */
export function isBlscenePoster(posterUrl: string): boolean {
  return posterUrl.includes(`/${FOLDER}/`) || posterUrl.includes("blscene.com");
}

export type BlsceneSyncResult = {
  checked: number;
  imported: { title: string; locationsImported: number; locationsWithCoords: number }[];
  refreshed: { title: string; newLocations: number }[];
  errors: { title: string; message: string }[];
};

export type BlsceneLocationRefreshResult = {
  checked: number;
  refreshed: { title: string; newLocations: number }[];
  errors: { title: string; message: string }[];
};

/**
 * Links `dramaId` to every scraped location, creating Location rows (+
 * resolving coordinates) for any that don't already exist by name — the
 * same real-world spot legitimately gets reused across multiple dramas
 * (blscene tracks this itself under "reused locations"), so an existing
 * Location row is linked rather than duplicated. Already-linked locations
 * are left untouched (upsert is a no-op), so calling this again on a
 * drama that's already fully linked does no extra work beyond the lookups.
 */
async function linkScrapedLocations(
  dramaId: string,
  locations: BlsceneDrama["locations"],
  browser: Browser,
  /** Страница blscene, с которой пришли локации — идёт в sourceUrl для
   *  атрибуции на странице локации (см. features/locations.md). */
  sourceUrl?: string | null,
): Promise<{ linked: number; newLocations: number; withCoords: number }> {
  let linked = 0;
  let newLocations = 0;
  let withCoords = 0;

  for (const loc of locations) {
    let location = await prisma.location.findFirst({ where: { name: loc.name } });

    if (!location) {
      const coords = loc.mapsUrl ? await resolveMapsCoords(loc.mapsUrl, browser) : null;
      if (coords) withCoords++;
      // Фото забираем к себе ДО записи. Не скачалось — downloadRemoteImage
      // вернёт исходную ссылку и напишет warning, локация всё равно
      // создастся.
      const photoUrl = await downloadRemoteImage(loc.photoUrl, FOLDER);
      location = await prisma.location.create({
        data: {
          name: loc.name,
          description: loc.areaText,
          photoUrl,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          sourceUrl: sourceUrl ?? "https://blscene.com",
        },
      });
      newLocations++;
    } else if (location.latitude != null) {
      withCoords++;
    }

    await prisma.dramaLocation.upsert({
      where: { dramaId_locationId: { dramaId, locationId: location.id } },
      update: {},
      create: { dramaId, locationId: location.id },
    });
    linked++;
  }

  return { linked, newLocations, withCoords };
}

/**
 * Creates one Drama (+ its Location/DramaLocation rows) from already-scraped
 * blscene data.
 */
export async function importScrapedDrama(
  scraped: BlsceneDrama,
  browser: Browser,
): Promise<{ locationsImported: number; locationsWithCoords: number }> {
  const drama = await prisma.drama.create({
    data: {
      title: scraped.title,
      year: scraped.year,
      posterUrl: await downloadRemoteImage(scraped.posterUrl, FOLDER),
      synopsis: scraped.synopsis,
      mydramalistUrl: scraped.mydramalistUrl,
      blsceneUrl: scraped.sourceUrl,
    },
  });

  const { linked, withCoords } = await linkScrapedLocations(
    drama.id,
    scraped.locations,
    browser,
    scraped.sourceUrl,
  );
  return { locationsImported: linked, locationsWithCoords: withCoords };
}

/**
 * Refreshes a Drama already imported from blscene: updates its metadata
 * fields to whatever's on the page now, and links any locations that have
 * since been added to that page (existing links are left alone).
 *
 * Постер и описание — только если у нас пусто или стоит наше же,
 * пришедшее с blscene. Раньше эта функция писала их безусловно, и
 * повторный прогон менял хороший постер (обычно с TMDB) на картинку со
 * страницы локаций — а там не афиша, а кадр из серии: у SOTUS S пляж из
 * девятой. Сериал при этом мог быть даже не «наш»: подходящую запись
 * ищут и по blsceneUrl, и по названию, так что под замену попадал и
 * сериал, заведённый руками. Название и год blscene по-прежнему правит —
 * его страница им хозяйка, а вот обложке нет.
 */
async function refreshScrapedDrama(
  dramaId: string,
  scraped: BlsceneDrama,
  browser: Browser,
): Promise<{ newLocations: number }> {
  const current = await prisma.drama.findUnique({
    where: { id: dramaId },
    select: { posterUrl: true, synopsis: true },
  });
  const mayReplacePoster = !current?.posterUrl || isBlscenePoster(current.posterUrl);

  // Повторный прогон дешёвый: файл уже на диске, downloadRemoteImage
  // отдаёт тот же локальный адрес без скачивания.
  await prisma.drama.update({
    where: { id: dramaId },
    data: {
      title: scraped.title,
      year: scraped.year,
      ...(mayReplacePoster
        ? { posterUrl: await downloadRemoteImage(scraped.posterUrl, FOLDER) }
        : {}),
      ...(current?.synopsis ? {} : { synopsis: scraped.synopsis }),
      mydramalistUrl: scraped.mydramalistUrl,
    },
  });

  const { newLocations } = await linkScrapedLocations(
    dramaId,
    scraped.locations,
    browser,
    scraped.sourceUrl,
  );
  return { newLocations };
}

/**
 * Compares blscene's A-Z index against our own Drama titles and imports
 * whatever's missing. Used both by the one-off backfill script and the
 * admin "check for new shows" action — same code path either way.
 */
export async function syncNewDramasFromBlscene(
  browser: Browser,
  onProgress?: (message: string) => void,
  /** Запуск из журнала импортов — тогда прогон можно остановить кнопкой
   *  «Остановить» на /admin/imports (проверка между сериалами). */
  runId?: string | null,
): Promise<BlsceneSyncResult> {
  const log = onProgress ?? (() => {});

  const index = await fetchBlsceneIndex();
  const existingDramas = await prisma.drama.findMany({
    select: { id: true, title: true, blsceneUrl: true },
  });
  // Prefer matching by blsceneUrl — a drama's on-page title (what actually
  // gets stored) can differ from its A-Z index link text, so title-only
  // matching can miss an already-imported drama and re-import it forever.
  // Title is kept as a fallback so manually-added dramas (no blsceneUrl
  // yet) still don't get duplicated.
  const byUrl = new Map(existingDramas.filter((d) => d.blsceneUrl).map((d) => [d.blsceneUrl!, d]));
  const existingTitles = new Set(existingDramas.map((d) => d.title.toLowerCase().trim()));

  const toImport = index.filter(
    (d) => !byUrl.has(d.url) && !existingTitles.has(d.title.toLowerCase().trim()),
  );
  // Everything else that's already linked by URL gets a light refresh pass
  // — blscene may have updated the poster/synopsis or added a location
  // since we last imported it.
  const toRefresh = index.filter((d) => byUrl.has(d.url));
  log(
    `${index.length} shows on blscene, ${toImport.length} not yet in our database, ${toRefresh.length} to refresh`,
  );

  const result: BlsceneSyncResult = { checked: index.length, imported: [], refreshed: [], errors: [] };

  for (const [i, entry] of toImport.entries()) {
    // Остановка по кнопке: уже импортированные сериалы и их локации
    // остаются, просто не берём следующий.
    await checkImportCancelled(runId);
    log(`[${i + 1}/${toImport.length}] ${entry.title}`);
    try {
      const scraped = await scrapeBlsceneDrama(entry.url);
      const { locationsImported, locationsWithCoords } = await importScrapedDrama(scraped, browser);
      result.imported.push({ title: scraped.title, locationsImported, locationsWithCoords });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`  ! failed: ${message}`);
      result.errors.push({ title: entry.title, message });
    }
  }

  for (const [i, entry] of toRefresh.entries()) {
    await checkImportCancelled(runId);
    const existing = byUrl.get(entry.url)!;
    log(`[refresh ${i + 1}/${toRefresh.length}] ${entry.title}`);
    try {
      const scraped = await scrapeBlsceneDrama(entry.url);
      const { newLocations } = await refreshScrapedDrama(existing.id, scraped, browser);
      if (newLocations > 0) {
        result.refreshed.push({ title: scraped.title, newLocations });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`  ! refresh failed: ${message}`);
      result.errors.push({ title: entry.title, message });
    }
  }

  return result;
}

/**
 * Re-scrapes every already-imported drama's blscene page to pick up filming
 * locations added there since our last visit — the locations-only half of
 * `syncNewDramasFromBlscene`, for the admin "check for new locations" action
 * on the locations page (new-drama importing stays on the dramas side,
 * covered by the standalone backfill script instead).
 */
export async function refreshBlsceneLocations(
  browser: Browser,
  onProgress?: (message: string) => void,
  /** Запуск из журнала импортов — см. syncNewDramasFromBlscene. */
  runId?: string | null,
): Promise<BlsceneLocationRefreshResult> {
  const log = onProgress ?? (() => {});

  const index = await fetchBlsceneIndex();
  const existingDramas = await prisma.drama.findMany({
    select: { id: true, title: true, blsceneUrl: true },
  });
  const byUrl = new Map(existingDramas.filter((d) => d.blsceneUrl).map((d) => [d.blsceneUrl!, d]));
  const toRefresh = index.filter((d) => byUrl.has(d.url));
  log(`${toRefresh.length} already-imported shows to check for new locations`);

  const result: BlsceneLocationRefreshResult = { checked: toRefresh.length, refreshed: [], errors: [] };

  for (const [i, entry] of toRefresh.entries()) {
    // Найденные локации уже связаны с сериалами — остановка их не
    // трогает, просто дальше не идём.
    await checkImportCancelled(runId);
    const existing = byUrl.get(entry.url)!;
    log(`[${i + 1}/${toRefresh.length}] ${entry.title}`);
    try {
      const scraped = await scrapeBlsceneDrama(entry.url);
      const { newLocations } = await refreshScrapedDrama(existing.id, scraped, browser);
      if (newLocations > 0) {
        result.refreshed.push({ title: scraped.title, newLocations });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`  ! refresh failed: ${message}`);
      result.errors.push({ title: entry.title, message });
    }
  }

  return result;
}
