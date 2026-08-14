import type { Browser } from "playwright";
import { prisma } from "@/lib/prisma";
import {
  fetchBlsceneIndex,
  scrapeBlsceneDrama,
  resolveMapsCoords,
  type BlsceneDrama,
} from "@/lib/blscene";

export type BlsceneSyncResult = {
  checked: number;
  imported: { title: string; locationsImported: number; locationsWithCoords: number }[];
  errors: { title: string; message: string }[];
};

/**
 * Creates one Drama (+ its Location/DramaLocation rows) from already-scraped
 * blscene data. Locations are deduped by exact name — the same real-world
 * spot legitimately gets reused across multiple dramas (blscene tracks this
 * itself under "reused locations"), so an existing Location row is linked
 * rather than duplicated.
 */
export async function importScrapedDrama(
  scraped: BlsceneDrama,
  browser: Browser,
): Promise<{ locationsImported: number; locationsWithCoords: number }> {
  const drama = await prisma.drama.create({
    data: {
      title: scraped.title,
      year: scraped.year,
      posterUrl: scraped.posterUrl,
      synopsis: scraped.synopsis,
      mydramalistUrl: scraped.mydramalistUrl,
      blsceneUrl: scraped.sourceUrl,
    },
  });

  let locationsImported = 0;
  let locationsWithCoords = 0;

  for (const loc of scraped.locations) {
    let location = await prisma.location.findFirst({ where: { name: loc.name } });

    if (!location) {
      const coords = loc.mapsUrl ? await resolveMapsCoords(loc.mapsUrl, browser) : null;
      if (coords) locationsWithCoords++;
      location = await prisma.location.create({
        data: {
          name: loc.name,
          description: loc.areaText,
          photoUrl: loc.photoUrl,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        },
      });
    } else if (location.latitude != null) {
      locationsWithCoords++;
    }

    await prisma.dramaLocation.upsert({
      where: { dramaId_locationId: { dramaId: drama.id, locationId: location.id } },
      update: {},
      create: { dramaId: drama.id, locationId: location.id },
    });
    locationsImported++;
  }

  return { locationsImported, locationsWithCoords };
}

/**
 * Compares blscene's A-Z index against our own Drama titles and imports
 * whatever's missing. Used both by the one-off backfill script and the
 * admin "check for new shows" action — same code path either way.
 */
export async function syncNewDramasFromBlscene(
  browser: Browser,
  onProgress?: (message: string) => void,
): Promise<BlsceneSyncResult> {
  const log = onProgress ?? (() => {});

  const index = await fetchBlsceneIndex();
  const existingDramas = await prisma.drama.findMany({
    select: { title: true, blsceneUrl: true },
  });
  // Prefer matching by blsceneUrl — a drama's on-page title (what actually
  // gets stored) can differ from its A-Z index link text, so title-only
  // matching can miss an already-imported drama and re-import it forever.
  // Title is kept as a fallback so manually-added dramas (no blsceneUrl
  // yet) still don't get duplicated.
  const existingUrls = new Set(
    existingDramas.map((d) => d.blsceneUrl).filter((u): u is string => !!u),
  );
  const existingTitles = new Set(existingDramas.map((d) => d.title.toLowerCase().trim()));

  const toImport = index.filter(
    (d) => !existingUrls.has(d.url) && !existingTitles.has(d.title.toLowerCase().trim()),
  );
  log(`${index.length} shows on blscene, ${toImport.length} not yet in our database`);

  const result: BlsceneSyncResult = { checked: index.length, imported: [], errors: [] };

  for (const [i, entry] of toImport.entries()) {
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

  return result;
}
