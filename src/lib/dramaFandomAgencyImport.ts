import { prisma } from "@/lib/prisma";
import { fetchDramaFandomAgencyPage } from "@/lib/dramaFandomAgency";
import { importAgencyProduction, findOrCreateAgencyArtist } from "@/lib/agencyTmdbMatching";
import type { Page } from "playwright";

export type DramaFandomAgencyImportSummary = {
  agencyName: string;
  productionsCreated: number;
  productionsUpdated: number;
  artistsCreated: number;
  artistsMatched: number;
  artistsAgencySet: number;
};

/** Imports an agency's drama.fandom.com category page (e.g. Be On
 *  Cloud): upserts the Agency, every production (matched against TMDB
 *  first, network/year filled in from the page either way), and every
 *  current/former artist — same matching as the Wikipedia agency
 *  importer (see agencyTmdbMatching.ts), just a different source page.
 *  No review step, same dedup-and-report shape as every other bulk
 *  importer here. */
export async function importDramaFandomAgency(
  pageUrlOrTitle: string,
  page: Page,
  onProgress?: (message: string) => void,
): Promise<DramaFandomAgencyImportSummary> {
  const log = onProgress ?? (() => {});
  const data = await fetchDramaFandomAgencyPage(pageUrlOrTitle, page);

  // Тот же канонический URL, что строит fetchDramaFandomAgencyPage, —
  // в блок «Источники» на странице агентства.
  const sourceUrl = pageUrlOrTitle.startsWith("http")
    ? pageUrlOrTitle
    : `https://drama.fandom.com/wiki/${encodeURIComponent(pageUrlOrTitle.replace(/ /g, "_"))}`;
  const agency = await prisma.agency.upsert({
    where: { name: data.name },
    update: { sourceUrl },
    create: { name: data.name, sourceUrl },
  });
  log(`Агентство: ${data.name}`);

  const summary: DramaFandomAgencyImportSummary = {
    agencyName: data.name,
    productionsCreated: 0,
    productionsUpdated: 0,
    artistsCreated: 0,
    artistsMatched: 0,
    artistsAgencySet: 0,
  };

  for (const [i, production] of data.productions.entries()) {
    const result = await importAgencyProduction(production, agency.id);
    if (result.created) summary.productionsCreated += 1;
    else summary.productionsUpdated += 1;
    log(
      `[Сериалы ${i + 1}/${data.productions.length}] ${production.title} — ${result.created ? "создан" : "обновлён"}`,
    );
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
