import { prisma } from "@/lib/prisma";
import { fetchChange2561ArtistIds, fetchChange2561Artist } from "@/lib/change2561";
import { fetchWikipediaAgencyPage } from "@/lib/wikipediaAgency";
import { importAgencyProduction, findOrCreateAgencyArtist } from "@/lib/agencyTmdbMatching";
import { syncSocialLinks } from "@/lib/performerSocialLinks";

const AGENCY_NAME = "Change2561";

export type Change2561ImportSummary = {
  artistsCreated: number;
  artistsMatched: number;
  artistsAgencySet: number;
  productionsCreated: number;
  productionsUpdated: number;
};

/** Imports CHANGE 2561's roster from two sources at once: artists from
 *  the agency's own site (change2561.com — see change2561.ts) and
 *  productions from its Wikipedia article (its own "works" listing
 *  mixes dramas together with music videos/ad campaigns with no clean
 *  way to separate them, unlike Wikipedia's dedicated "Television
 *  dramas" list). Both feed the same Agency; artists aren't
 *  cross-matched against specific productions, they're just two
 *  parallel enrichment passes over the one studio. Same matching/
 *  dedup rules as every other agency importer (agencyTmdbMatching.ts),
 *  no review step. */
export async function importChange2561(onProgress?: (message: string) => void): Promise<Change2561ImportSummary> {
  const log = onProgress ?? (() => {});
  const agency = await prisma.agency.upsert({
    where: { name: AGENCY_NAME },
    update: { sourceUrl: "https://www.change2561.com/changeartist" },
    create: { name: AGENCY_NAME, sourceUrl: "https://www.change2561.com/changeartist" },
  });
  log(`Агентство: ${AGENCY_NAME}`);

  const summary: Change2561ImportSummary = {
    artistsCreated: 0,
    artistsMatched: 0,
    artistsAgencySet: 0,
    productionsCreated: 0,
    productionsUpdated: 0,
  };

  const wiki = await fetchWikipediaAgencyPage("https://en.wikipedia.org/wiki/Change2561");
  log(`Сериалы (Wikipedia): найдено ${wiki.productions.length}`);
  for (const [i, production] of wiki.productions.entries()) {
    const result = await importAgencyProduction(production, agency.id);
    if (result.created) summary.productionsCreated += 1;
    else summary.productionsUpdated += 1;
    log(
      `[Сериалы ${i + 1}/${wiki.productions.length}] ${production.title} — ${result.created ? "создан" : "обновлён"}`,
    );
  }

  const artistIds = await fetchChange2561ArtistIds();
  log(`Артисты (change2561.com): найдено ${artistIds.length}`);
  for (const [i, id] of artistIds.entries()) {
    const artist = await fetchChange2561Artist(id);
    if (!artist) {
      log(`[Артисты ${i + 1}/${artistIds.length}] id ${id} — пропущен (нет имени)`);
      continue;
    }

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
      select: { id: true },
    });
    if (performer) await syncSocialLinks(performer.id, artist.socialLinks);

    log(
      `[Артисты ${i + 1}/${artistIds.length}] ${artist.nickname} (${artist.fullName}) — ${result.created ? "создан" : "найден"}`,
    );
  }

  return summary;
}
