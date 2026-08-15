import { prisma } from "@/lib/prisma";
import { fetchTmdbPerson, deriveNicknameFromAlsoKnownAs } from "@/lib/tmdb";
import { matchTmdbTvShow, matchTmdbPerson, importShow } from "@/lib/tmdbImport";
import { addPerformerAgency } from "@/lib/performerAgency";
import { syncSocialLinks } from "@/lib/performerSocialLinks";

// Shared "match against TMDB first, fall back to the agency's own page
// as a first-party source" logic for every agency importer sourced from
// a page that lists productions/artists in "Title (Network, Year)" /
// "Full Name (Nickname)" shape — currently wikipediaAgencyImport.ts and
// dramaFandomAgencyImport.ts (drama.fandom.com). Extracted here once a
// second source needed byte-identical matching, rather than duplicating
// it a second time.

/** Imports one production into the catalog, tagged with `agencyId`.
 *  TMDB is checked first (`matchTmdbTvShow`) since it's the richer,
 *  more reliable source once a match exists; `network` (which TMDB
 *  doesn't reliably carry for Thai channels) is layered on top from the
 *  agency's own page either way. No TMDB match still creates/updates a
 *  Drama from the agency page's own data — a studio's own listing is a
 *  first-party source for what it produced, worth keeping even
 *  unmatched. */
export async function importAgencyProduction(
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

  const existing = await prisma.drama.findFirst({
    where: { title: { equals: production.title, mode: "insensitive" } },
  });
  const data = { title: production.title, year: production.year, network: production.network, agencyId };
  if (existing) await prisma.drama.update({ where: { id: existing.id }, data });
  else await prisma.drama.create({ data });
  return { created: !existing };
}

/** Finds or creates a `Performer` for one agency-page artist entry, and
 *  *adds* `agencyId` to their agency set (never overwrites — a
 *  performer can be signed to more than one at once, see
 *  PerformerAgency in schema.prisma). Matched by `realName`/`name`
 *  first; a miss falls through to a TMDB person search before creating
 *  anyone new, so a brand-new `Performer` still gets a real photo/
 *  tmdbId/place of birth when TMDB has them. */
export async function findOrCreateAgencyArtist(
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
    include: { agencies: { select: { agencyId: true } } },
  });

  if (existing) {
    const agencySet = !existing.agencies.some((a) => a.agencyId === agencyId);
    if (agencySet) await addPerformerAgency(existing.id, agencyId);
    // Fallback-name repair: a performer created with name===realName
    // (no nickname known yet) gets the nickname this page already
    // spells out — same convention as syncPerformerFromTmdb's
    // also_known_as check, but simpler here since no TMDB lookup is
    // needed to know the nickname.
    const looksLikeFallbackName =
      !!existing.realName && existing.name.trim().toLowerCase() === existing.realName.trim().toLowerCase();
    if (looksLikeFallbackName && artist.nickname) {
      await prisma.performer.update({ where: { id: existing.id }, data: { name: artist.nickname } });
    }
    return { created: false, agencySet };
  }

  const personId = await matchTmdbPerson(artist.fullName);
  if (personId) {
    const tmdbId = String(personId);
    // The TMDB match can resolve to someone already in our DB under a
    // name/realName spelling different enough that the lookup above
    // missed them — creating anyway would collide on tmdbId's
    // uniqueness, so treat a hit here as the same match-existing path.
    const byTmdbId = await prisma.performer.findUnique({
      where: { tmdbId },
      include: { agencies: { select: { agencyId: true } } },
    });
    if (byTmdbId) {
      const agencySet = !byTmdbId.agencies.some((a) => a.agencyId === agencyId);
      if (agencySet) await addPerformerAgency(byTmdbId.id, agencyId);
      return { created: false, agencySet };
    }

    const person = await fetchTmdbPerson(tmdbId);
    const nickname = deriveNicknameFromAlsoKnownAs(person.name, person.alsoKnownAs) ?? artist.nickname;
    const created = await prisma.performer.create({
      data: {
        name: nickname,
        realName: artist.fullName,
        type: "SOLO",
        tmdbId,
        photoUrl: person.photoUrl,
        placeOfBirth: person.placeOfBirth,
        birthDate: person.birthDate ? new Date(person.birthDate) : null,
        agencies: { create: { agencyId } },
      },
    });
    await syncSocialLinks(created.id, person.socialLinks);
    return { created: true, agencySet: true };
  }

  await prisma.performer.create({
    data: { name: artist.nickname, realName: artist.fullName, type: "SOLO", agencies: { create: { agencyId } } },
  });
  return { created: true, agencySet: true };
}
