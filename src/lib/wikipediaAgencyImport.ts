import { prisma } from "@/lib/prisma";
import { fetchWikipediaAgencyPage } from "@/lib/wikipediaAgency";
import { fetchTmdbPerson, deriveNicknameFromAlsoKnownAs } from "@/lib/tmdb";
import { matchTmdbTvShow, matchTmdbPerson, importShow } from "@/lib/tmdbImport";

async function importAgencyProduction(
  production: { year: number | null; title: string; network: string | null },
  agencyId: string,
): Promise<{ created: boolean }> {
  const tvId = await matchTmdbTvShow(production.title, production.year);
  if (tvId) {
    const result = await importShow(tvId);
    await prisma.drama.update({
      where: { id: result.dramaId },
      data: { network: production.network, agencyId },
    });
    return { created: result.created };
  }

  // TMDB has nothing for this title — still worth keeping, this agency's
  // own page is a first-party source for its own productions. Matched by
  // title alone (no tmdbId to key off), same as the drama-sweep's own
  // last-resort fallback.
  const existing = await prisma.drama.findFirst({
    where: { title: { equals: production.title, mode: "insensitive" } },
  });
  const data = { title: production.title, year: production.year, network: production.network, agencyId };
  if (existing) await prisma.drama.update({ where: { id: existing.id }, data });
  else await prisma.drama.create({ data });
  return { created: !existing };
}

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

async function findOrCreateAgencyArtist(
  artist: { fullName: string; nickname: string },
  agencyId: string,
): Promise<{ created: boolean; agencySet: boolean }> {
  const existing = await prisma.performer.findFirst({
    where: {
      OR: [
        { realName: { equals: artist.fullName, mode: "insensitive" } },
        { name: { equals: artist.nickname, mode: "insensitive" } },
      ],
    },
  });

  if (existing) {
    // Only fills in a missing agency — a performer's current label
    // elsewhere might be more specific/correct than a Wikipedia roster
    // list, so this never overwrites one that's already set.
    const agencySet = !existing.agencyId;
    // Same fallback-name repair as syncPerformerFromTmdb's also_known_as
    // check, but simpler here — the wiki roster already spells out the
    // nickname directly ("Pruk Panich (Zee)"), no TMDB lookup needed.
    const looksLikeFallbackName =
      !!existing.realName && existing.name.trim().toLowerCase() === existing.realName.trim().toLowerCase();
    const nameFix = looksLikeFallbackName && artist.nickname ? artist.nickname : undefined;
    if (agencySet || nameFix) {
      await prisma.performer.update({
        where: { id: existing.id },
        data: { ...(agencySet ? { agencyId } : {}), ...(nameFix ? { name: nameFix } : {}) },
      });
    }
    return { created: false, agencySet };
  }

  // Not in our DB by name/realName — check TMDB before creating from
  // Wikipedia data alone, so a brand-new Performer still gets a real
  // photo/tmdbId/place of birth when TMDB has them.
  const personId = await matchTmdbPerson(artist.fullName);
  if (personId) {
    const tmdbId = String(personId);
    // The TMDB match can resolve to someone already in our DB under a
    // name/realName spelling different enough that the lookup above
    // missed them (their `tmdbId` is the reliable signal, not text) —
    // creating anyway would collide on tmdbId's uniqueness. Treat it as
    // the same match-existing path instead of a create.
    const byTmdbId = await prisma.performer.findUnique({ where: { tmdbId } });
    if (byTmdbId) {
      const agencySet = !byTmdbId.agencyId;
      if (agencySet) await prisma.performer.update({ where: { id: byTmdbId.id }, data: { agencyId } });
      return { created: false, agencySet };
    }

    const person = await fetchTmdbPerson(tmdbId);
    const nickname = deriveNicknameFromAlsoKnownAs(person.name, person.alsoKnownAs) ?? artist.nickname;
    await prisma.performer.create({
      data: {
        name: nickname,
        realName: artist.fullName,
        type: "SOLO",
        tmdbId,
        photoUrl: person.photoUrl,
        placeOfBirth: person.placeOfBirth,
        agencyId,
      },
    });
    return { created: true, agencySet: true };
  }

  await prisma.performer.create({
    data: { name: artist.nickname, realName: artist.fullName, type: "SOLO", agencyId },
  });
  return { created: true, agencySet: true };
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
 *  TMDB before creating anyone new). No review step — same dedup-and-
 *  report shape as the GMMTV/TMDB bulk importers, since a roster this
 *  size isn't practical to review row by row. */
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
