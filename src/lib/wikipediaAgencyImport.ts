import { prisma } from "@/lib/prisma";
import { fetchWikipediaAgencyPage } from "@/lib/wikipediaAgency";
import { matchTmdbTvShow, importShow } from "@/lib/tmdbImport";
import { importAgencyProduction, findOrCreateAgencyArtist } from "@/lib/agencyTmdbMatching";

async function importAgencyUpcoming(
  upcoming: { title: string; notes: string | null },
  agencyId: string,
): Promise<{ created: boolean }> {
  const tvId = await matchTmdbTvShow(upcoming.title, null);
  if (tvId) {
    const result = await importShow(tvId);
    await prisma.drama.update({ where: { id: result.dramaId }, data: { agencyId } });
    return { created: result.created };
  }

  const existing = await prisma.drama.findFirst({
    where: { title: { equals: upcoming.title, mode: "insensitive" } },
  });
  const data = {
    title: upcoming.title,
    synopsis: upcoming.notes,
    status: "PLANNED" as const,
    agencyId,
  };
  if (existing) await prisma.drama.update({ where: { id: existing.id }, data });
  else await prisma.drama.create({ data });
  return { created: !existing };
}

export type WikipediaAgencyImportSummary = {
  agencyName: string;
  productionsCreated: number;
  productionsUpdated: number;
  upcomingCreated: number;
  upcomingUpdated: number;
  artistsCreated: number;
  artistsMatched: number;
  artistsAgencySet: number;
};

/** Imports an agency's Wikipedia article: upserts the Agency (name,
 *  logo, description), each production in its "Television series" table
 *  (matched against TMDB first — see matchTmdbTvShow — with the wiki
 *  page's `network` column added on since TMDB doesn't reliably carry
 *  that for Thai networks), each "Upcoming TV series" entry as a
 *  DramaStatus.PLANNED row, and every artist in its "Current"/"Former"
 *  roster (matched against our DB by realName/nickname, checked against
 *  TMDB before creating anyone new — see agencyTmdbMatching.ts). No
 *  review step — same dedup-and-report shape as the GMMTV/TMDB bulk
 *  importers, since a roster this size isn't practical to review row by
 *  row. */
export async function importWikipediaAgency(
  pageUrlOrTitle: string,
  onProgress?: (message: string) => void,
): Promise<WikipediaAgencyImportSummary> {
  const log = onProgress ?? (() => {});
  const data = await fetchWikipediaAgencyPage(pageUrlOrTitle);

  const agency = await prisma.agency.upsert({
    where: { name: data.name },
    update: {
      ...(data.logoUrl ? { logoUrl: data.logoUrl } : {}),
      ...(data.description ? { description: data.description } : {}),
    },
    create: { name: data.name, logoUrl: data.logoUrl, description: data.description },
  });
  log(`Агентство: ${data.name}`);

  const summary: WikipediaAgencyImportSummary = {
    agencyName: data.name,
    productionsCreated: 0,
    productionsUpdated: 0,
    upcomingCreated: 0,
    upcomingUpdated: 0,
    artistsCreated: 0,
    artistsMatched: 0,
    artistsAgencySet: 0,
  };

  for (const [i, production] of data.productions.entries()) {
    const result = await importAgencyProduction(production, agency.id);
    if (result.created) summary.productionsCreated += 1;
    else summary.productionsUpdated += 1;
    log(`[Сериалы ${i + 1}/${data.productions.length}] ${production.title} — ${result.created ? "создан" : "обновлён"}`);
  }

  for (const [i, upcoming] of data.upcoming.entries()) {
    const result = await importAgencyUpcoming(upcoming, agency.id);
    if (result.created) summary.upcomingCreated += 1;
    else summary.upcomingUpdated += 1;
    log(`[Анонсы ${i + 1}/${data.upcoming.length}] ${upcoming.title} — ${result.created ? "создан" : "обновлён"}`);
  }

  const allArtists = [...data.currentArtists, ...data.formerArtists];
  for (const [i, artist] of allArtists.entries()) {
    const result = await findOrCreateAgencyArtist(artist, agency.id);
    if (result.created) summary.artistsCreated += 1;
    else {
      summary.artistsMatched += 1;
      if (result.agencySet) summary.artistsAgencySet += 1;
    }
    log(
      `[Артисты ${i + 1}/${allArtists.length}] ${artist.nickname} (${artist.fullName}) — ${result.created ? "создан" : "найден"}`,
    );
  }

  return summary;
}
