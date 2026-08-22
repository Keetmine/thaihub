import { prisma } from "@/lib/prisma";
import { fetchMemindyArtists } from "@/lib/memindy";
import { importAgencyProduction, findOrCreateAgencyArtist } from "@/lib/agencyTmdbMatching";
import { syncSocialLinks } from "@/lib/performerSocialLinks";
import type { Page } from "playwright";

const AGENCY_NAME = "Me Mind Y";

export type MemindyImportSummary = {
  artistsCreated: number;
  artistsMatched: number;
  artistsAgencySet: number;
  seriesCreated: number;
  seriesUpdated: number;
};

/** Imports Me Mind Y's artist roster (memindy.com/en/artist/): upserts
 *  the Agency, then for each artist matches/creates a `Performer` (see
 *  agencyTmdbMatching.ts — same "add to agency set" semantics as the
 *  Wikipedia/drama.fandom.com importers), fills in a blank `photoUrl`,
 *  syncs their social links, and cross-checks every title in their
 *  "Previous Works — Series" list against the catalog (matched against
 *  TMDB first, created from the site's own data if TMDB has no match —
 *  a studio's own roster page is a first-party source worth keeping
 *  either way), tagging each as this agency's production. No review
 *  step, same dedup-and-report shape as the other bulk importers. */
export async function importMemindyAgency(
  page: Page,
  onProgress?: (message: string) => void,
): Promise<MemindyImportSummary> {
  const log = onProgress ?? (() => {});
  const agency = await prisma.agency.upsert({
    where: { name: AGENCY_NAME },
    update: { sourceUrl: "https://www.memindy.com/en/artist/" },
    create: { name: AGENCY_NAME, sourceUrl: "https://www.memindy.com/en/artist/" },
  });
  log(`Агентство: ${AGENCY_NAME}`);

  const artists = await fetchMemindyArtists(page);
  log(`Найдено артистов: ${artists.length}`);

  const summary: MemindyImportSummary = {
    artistsCreated: 0,
    artistsMatched: 0,
    artistsAgencySet: 0,
    seriesCreated: 0,
    seriesUpdated: 0,
  };
  const seenSeries = new Set<string>();

  for (const [i, artist] of artists.entries()) {
    const result = await findOrCreateAgencyArtist(artist, agency.id);
    if (result.created) summary.artistsCreated += 1;
    else {
      summary.artistsMatched += 1;
      if (result.agencySet) summary.artistsAgencySet += 1;
    }

    const performer = await prisma.performer.findFirst({
      where: {
        OR: [
          { realName: { equals: artist.fullName, mode: "insensitive" } },
          { name: { equals: artist.nickname, mode: "insensitive" } },
        ],
      },
      select: { id: true, photoUrl: true },
    });
    if (performer) {
      if (!performer.photoUrl && artist.photoUrl) {
        await prisma.performer.update({ where: { id: performer.id }, data: { photoUrl: artist.photoUrl } });
      }
      await syncSocialLinks(performer.id, artist.socialLinks);
    }

    log(
      `[Артисты ${i + 1}/${artists.length}] ${artist.nickname} (${artist.fullName}) — ${result.created ? "создан" : "найден"}, сериалов: ${artist.series.length}`,
    );

    for (const title of artist.series) {
      if (seenSeries.has(title.toLowerCase())) continue;
      seenSeries.add(title.toLowerCase());
      const seriesResult = await importAgencyProduction({ title, year: null, network: null }, agency.id);
      if (seriesResult.created) summary.seriesCreated += 1;
      else summary.seriesUpdated += 1;
      log(`  [Сериал] ${title} — ${seriesResult.created ? "создан" : "обновлён"}`);
    }
  }

  return summary;
}
