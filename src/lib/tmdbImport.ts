import { prisma } from "@/lib/prisma";
import type { DramaStatus } from "@/generated/prisma/client";
import {
  fetchTmdbPerson,
  fetchTmdbPersonKnownForTv,
  fetchTmdbTvShow,
  fetchTmdbTvCredits,
  searchTmdbTvShows,
  searchTmdbPeople,
  deriveNicknameFromAlsoKnownAs,
  fetchTmdbCompany,
  fetchTmdbCompanyTvShows,
  type TmdbKnownForShow,
} from "@/lib/tmdb";
import { addPerformerAgency } from "@/lib/performerAgency";
import { syncSocialLinks } from "@/lib/performerSocialLinks";
import { downloadRemoteImage } from "@/lib/localImage";

export type TmdbImportPreview = {
  tmdbPersonId: string;
  name: string;
  biography: string | null;
  placeOfBirth: string | null;
  photoUrl: string | null;
  knownFor: (TmdbKnownForShow & { alreadyImported: boolean; status: DramaStatus | null })[];
};

/** Fetches a TMDB person plus their "known for" TV shows (including each
 *  show's air status, so the review screen can show it), flagging which
 *  shows are already in our DB (matched by tmdbId) — read-only, nothing
 *  written yet. The admin picks which shows to actually pull in on the
 *  review screen before commitTmdbPersonImport runs. */
export async function previewTmdbPersonImport(tmdbPersonId: string): Promise<TmdbImportPreview> {
  const [person, knownForRaw] = await Promise.all([
    fetchTmdbPerson(tmdbPersonId),
    fetchTmdbPersonKnownForTv(tmdbPersonId),
  ]);

  const [existing, statuses] = await Promise.all([
    prisma.drama.findMany({
      where: { tmdbId: { in: knownForRaw.map((s) => String(s.tvId)) } },
      select: { tmdbId: true },
    }),
    Promise.all(knownForRaw.map((s) => fetchTmdbTvShow(s.tvId))),
  ]);
  const existingTvIds = new Set(existing.map((d) => d.tmdbId));
  const statusByTvId = new Map(statuses.map((s) => [s.id, s.status]));

  return {
    tmdbPersonId: String(person.id),
    name: person.name,
    biography: person.biography,
    placeOfBirth: person.placeOfBirth,
    photoUrl: person.photoUrl,
    knownFor: knownForRaw.map((s) => ({
      ...s,
      alreadyImported: existingTvIds.has(String(s.tvId)),
      status: statusByTvId.get(s.tvId) ?? null,
    })),
  };
}

async function findOrCreateCastPerformer(cast: {
  personId: number;
  name: string;
  photoUrl: string | null;
}): Promise<{ id: string; created: boolean }> {
  const tmdbId = String(cast.personId);
  const existing = await prisma.performer.findFirst({
    where: {
      OR: [
        { tmdbId },
        { realName: { equals: cast.name, mode: "insensitive" } },
        { name: { equals: cast.name, mode: "insensitive" } },
      ],
    },
  });

  if (existing) {
    if (!existing.tmdbId) {
      await prisma.performer.update({ where: { id: existing.id }, data: { tmdbId } });
    }
    return { id: existing.id, created: false };
  }

  // Not in our DB yet — worth the extra request for the full person (cast
  // credits alone don't include also_known_as/place_of_birth): fans go by
  // a nickname, not "Firstname Lastname", so a fresh Performer should get
  // one as its `name` when TMDB's also_known_as has one, not the full
  // real name in both `name` and `realName`.
  const person = await fetchTmdbPerson(tmdbId);
  const nickname = deriveNicknameFromAlsoKnownAs(person.name, person.alsoKnownAs);
  const photoUrl = await downloadRemoteImage(cast.photoUrl ?? person.photoUrl, "tmdb");

  const created = await prisma.performer.create({
    data: {
      name: nickname ?? cast.name,
      realName: cast.name,
      type: "SOLO",
      tmdbId,
      photoUrl,
      placeOfBirth: person.placeOfBirth,
      birthDate: person.birthDate ? new Date(person.birthDate) : null,
    },
  });
  await syncSocialLinks(created.id, person.socialLinks);
  return { id: created.id, created: true };
}

/** Thrown when a show's tmdbId is already claimed by a *different* Drama
 *  row than the one being synced — usually means our own catalog has two
 *  rows for what TMDB considers one show (a multi-season series split
 *  into separate rows per season, e.g. "SOTUS"/"SOTUS S", or a plain
 *  pre-existing duplicate, e.g. "I told sunset"/"I Told Sunset About
 *  You"). Caught by the sync callers and reported as "conflict" rather
 *  than crashing — it needs a human to merge via the existing duplicate
 *  tool (docs/features/duplicates.md), not a silent auto-resolution. */
class TmdbConflictError extends Error {
  constructor(public readonly claimedByTitle: string) {
    super(`tmdbId already claimed by "${claimedByTitle}"`);
  }
}

/** `knownDramaId`, when given, is used as-is instead of the tmdbId-then-
 *  title search — for callers that already know exactly which Drama row
 *  this show corresponds to (the bulk drama sweep, syncing a specific
 *  Drama that's already in our DB, or a Wikipedia agency import matching
 *  by its own title search first). Without it, TMDB's own title can
 *  differ just enough from ours ("2gether" vs. TMDB's "2gether: The
 *  Series") that the title fallback misses and creates a duplicate
 *  instead of updating the existing row — a real bug hit while testing
 *  the bulk sweep, not a hypothetical. */
export async function importShow(
  tvId: number,
  knownDramaId?: string,
): Promise<{ dramaId: string; created: boolean; castCreated: number; castPerformerIds: string[] }> {
  const [show, credits] = await Promise.all([fetchTmdbTvShow(tvId), fetchTmdbTvCredits(tvId)]);
  const tmdbId = String(show.id);

  const existing = knownDramaId
    ? await prisma.drama.findUnique({ where: { id: knownDramaId } })
    : await prisma.drama.findFirst({
        where: {
          OR: [{ tmdbId }, { title: { equals: show.name, mode: "insensitive" } }],
        },
      });

  const claimedBy = await prisma.drama.findUnique({ where: { tmdbId } });
  if (claimedBy && claimedBy.id !== existing?.id) {
    throw new TmdbConflictError(claimedBy.title);
  }

  const dramaData = {
    title: show.name,
    synopsis: show.overview,
    posterUrl: await downloadRemoteImage(show.posterUrl, "tmdb"),
    year: show.year,
    status: show.status,
    tmdbId,
  };

  const drama = existing
    ? await prisma.drama.update({ where: { id: existing.id }, data: dramaData })
    : await prisma.drama.create({ data: dramaData });

  const { castCreated, castPerformerIds } = await linkTmdbCast(drama.id, credits);
  return { dramaId: drama.id, created: !existing, castCreated, castPerformerIds };
}

/**
 * Привязка каста TMDB к сериалу. Вынесена из `importShow` отдельной
 * функцией, потому что у той походы в сеть зашиты внутрь, а правило про
 * роли ниже стоит проверять тестом.
 *
 * Роль (имя персонажа) ДОПИСЫВАЕМ, но НЕ перезаписываем. Раньше здесь
 * стоял upsert с безусловным `role`, и импорт одного актёра с TMDB
 * затирал персонажей всему касту каждого выбранного сериала: у TMDB
 * поле character у тайских тайтлов сплошь пустое, а у нас там обычно
 * имя с MyDramaList. Со стороны это выглядело так, что роли на странице
 * сериала «сами исчезли» после импорта актёра (жалоба владельца
 * 2026-09-23).
 */
export async function linkTmdbCast(
  dramaId: string,
  credits: { personId: number; name: string; photoUrl: string | null; character: string | null }[],
): Promise<{ castCreated: number; castPerformerIds: string[] }> {
  let castCreated = 0;
  const castPerformerIds: string[] = [];
  for (const member of credits) {
    const { id: performerId, created } = await findOrCreateCastPerformer(member);
    if (created) castCreated += 1;
    castPerformerIds.push(performerId);

    const existingLink = await prisma.performerDrama.findUnique({
      where: { performerId_dramaId: { performerId, dramaId } },
      select: { role: true },
    });
    if (!existingLink) {
      await prisma.performerDrama.create({
        data: { performerId, dramaId, role: member.character || null },
      });
    } else if (!existingLink.role && member.character) {
      await prisma.performerDrama.update({
        where: { performerId_dramaId: { performerId, dramaId } },
        data: { role: member.character },
      });
    }
  }
  return { castCreated, castPerformerIds };
}

export type TmdbImportResult = {
  createdDramas: number;
  updatedDramas: number;
  createdPerformers: number;
};

/** Applies the reviewed selection: updates the target performer's profile
 *  fields, then imports each selected show (create-or-update by tmdbId,
 *  falling back to a title match) along with its full cast (matched by
 *  tmdbId, then realName, then name — creating new Performer rows for
 *  anyone not already in the DB). Runs shows sequentially, not in
 *  parallel, so the target performer's own tmdbId is already set by the
 *  time their own cast credit is processed — otherwise they'd get
 *  duplicated as a fresh Performer instead of matching themselves. */
export async function commitTmdbPersonImport(input: {
  performerId: string;
  tmdbPersonId: string;
  placeOfBirth: string;
  selectedTvIds: number[];
}): Promise<TmdbImportResult> {
  // Re-fetched rather than threaded through from the review screen's
  // preview payload — birthDate/socialLinks aren't editable fields there
  // (only placeOfBirth is), so there's nothing worth adding to that
  // round-trip just to avoid one extra request here.
  const person = await fetchTmdbPerson(input.tmdbPersonId);
  await prisma.performer.update({
    where: { id: input.performerId },
    data: {
      tmdbId: input.tmdbPersonId,
      placeOfBirth: input.placeOfBirth || null,
      birthDate: person.birthDate ? new Date(person.birthDate) : null,
    },
  });
  await syncSocialLinks(input.performerId, person.socialLinks);

  let createdDramas = 0;
  let updatedDramas = 0;
  let createdPerformers = 0;

  for (const tvId of input.selectedTvIds) {
    const result = await importShow(tvId);
    if (result.created) createdDramas += 1;
    else updatedDramas += 1;
    createdPerformers += result.castCreated;
  }

  return { createdDramas, updatedDramas, createdPerformers };
}

// ---------------------------------------------------------------------
// Bulk sync: sweep the whole catalog against TMDB instead of one person/
// drama at a time. A title or name search alone is too ambiguous to
// trust blindly (e.g. "Cutie Pie" matches two unrelated shows, "Off"
// matches random unrelated people) — matchTmdbTvShow/matchTmdbPerson
// narrow candidates (Thai origin + release year for shows, the
// "Acting" department for people) and return null rather than guess
// when nothing looks confidently right, so a bulk run skips-and-reports
// instead of silently writing a wrong match.
// ---------------------------------------------------------------------

/** Normalized substring-or-shared-significant-word check — guards against
 *  TMDB's search returning *some* Thai-origin result that isn't actually
 *  related to the query at all (hit for real: "The Boyfriend" search
 *  returned only "Sweet Tooth, Good Dentist" as its lone Thai candidate,
 *  zero title overlap — a wrong match the old code would've accepted on
 *  "only one Thai candidate" alone). */
function titlesLookRelated(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const wordsA = new Set(na.split(/\s+/).filter((w) => w.length >= 4));
  return nb.split(/\s+/).some((w) => w.length >= 4 && wordsA.has(w));
}

export async function matchTmdbTvShow(title: string, year: number | null): Promise<number | null> {
  const results = await searchTmdbTvShows(title);
  const related = results.filter((r) => titlesLookRelated(title, r.name));
  if (related.length === 0) return null;

  const thai = related.filter((r) => r.isThaiOrigin);
  const candidates = thai.length > 0 ? thai : related;

  if (year) {
    const withYearMatch = candidates.find((r) => r.year !== null && Math.abs(r.year - year) <= 1);
    if (withYearMatch) return withYearMatch.id;
  }

  // No confident year match — still fine to trust a single Thai-origin
  // (and title-related) candidate (our stored year can be slightly off,
  // e.g. production vs. air year), but multiple candidates with no year
  // to disambiguate them is a genuine "don't guess" case.
  if (thai.length === 1) return thai[0].id;
  return null;
}

export async function matchTmdbPerson(realName: string): Promise<number | null> {
  const results = await searchTmdbPeople(realName);
  if (results.length === 0) return null;
  const actors = results.filter((r) => r.isActor);
  const candidates = actors.length > 0 ? actors : results;
  return candidates[0].id;
}

export type PerformerSyncOutcome =
  | { status: "synced"; dramasCreated: number; dramasUpdated: number; castCreated: number; showsSkipped: number }
  | { status: "not_found" }
  | { status: "error"; message: string };

/** Syncs one Performer already in our DB against TMDB: refreshes
 *  directly by tmdbId if they have one, otherwise searches-and-matches
 *  by realName (a bare nickname is too ambiguous to search by — skipped
 *  if realName isn't set). Updates placeOfBirth (only if TMDB actually
 *  has a value — never clobbers an existing one with nothing) and syncs
 *  every "known for" show via the same importShow as the single-person
 *  flow, just without a review step to pick a subset. */
export async function syncPerformerFromTmdb(performer: {
  id: string;
  name: string;
  realName: string | null;
  tmdbId: string | null;
}): Promise<PerformerSyncOutcome> {
  try {
    const personId = performer.tmdbId
      ? Number(performer.tmdbId)
      : performer.realName
        ? await matchTmdbPerson(performer.realName)
        : null;
    if (!personId) return { status: "not_found" };

    const [person, knownFor] = await Promise.all([
      fetchTmdbPerson(String(personId)),
      fetchTmdbPersonKnownForTv(String(personId)),
    ]);

    // A performer created from an earlier cast import without a
    // deriveNicknameFromAlsoKnownAs match ends up with its full real name
    // in both `name` and `realName` — worth another try here now that a
    // dedicated sync (not a cast-import side effect) is looking this
    // person up directly. Never touches a `name` that's already distinct
    // from `realName` — that's a real curated nickname, not a fallback.
    const looksLikeFallbackName = performer.realName
      ? performer.name.trim().toLowerCase() === performer.realName.trim().toLowerCase()
      : false;
    const nickname = looksLikeFallbackName
      ? deriveNicknameFromAlsoKnownAs(person.name, person.alsoKnownAs)
      : null;

    await prisma.performer.update({
      where: { id: performer.id },
      data: {
        tmdbId: String(personId),
        ...(person.placeOfBirth ? { placeOfBirth: person.placeOfBirth } : {}),
        ...(nickname ? { name: nickname } : {}),
      },
    });

    let dramasCreated = 0;
    let dramasUpdated = 0;
    let castCreated = 0;
    let showsSkipped = 0;
    for (const show of knownFor) {
      try {
        const result = await importShow(show.tvId);
        if (result.created) dramasCreated += 1;
        else dramasUpdated += 1;
        castCreated += result.castCreated;
      } catch (err) {
        // One conflicting/broken show (usually a pre-existing duplicate
        // in our own catalog, see TmdbConflictError) shouldn't sink the
        // rest of this performer's known-for list.
        if (err instanceof TmdbConflictError) showsSkipped += 1;
        else throw err;
      }
    }

    return { status: "synced", dramasCreated, dramasUpdated, castCreated, showsSkipped };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export type PerformerSyncSummary = {
  total: number;
  synced: number;
  notFound: number;
  errors: number;
  dramasCreated: number;
  dramasUpdated: number;
  castCreated: number;
  showsSkipped: number;
  notFoundNames: string[];
};


export type TmdbCompanySyncSummary = {
  companyName: string;
  totalShows: number;
  dramasCreated: number;
  dramasUpdated: number;
  castCreated: number;
  performersAgencyAdded: number;
};

/**
 * Imports every TV show TMDB credits to a production company (e.g.
 * Studio Wabi Sabi) — same show list themoviedb.org's own company "TV"
 * tab shows — via `importShow`, and adds the company as an `Agency` on
 * both every imported `Drama` and every performer in each show's cast.
 *
 * A studio's own TMDB catalog is authoritative for what it produced, so
 * `Drama.agencyId` is set unconditionally (even on an already-existing
 * row — same reasoning as the Wikipedia agency importer's productions).
 * A cast member's agency is *added* to their set rather than overwriting
 * — the same drama can be co-produced by two studios, so a performer
 * formally signed elsewhere (most commonly GMMTV, in this catalog) can
 * still appear in this company's shows without that reassigning them;
 * see PerformerAgency in schema.prisma.
 */
export async function importTmdbCompany(
  companyId: string,
  onProgress?: (message: string) => void,
): Promise<TmdbCompanySyncSummary> {
  const log = onProgress ?? (() => {});
  const company = await fetchTmdbCompany(companyId);
  const logoUrl = await downloadRemoteImage(company.logoUrl, "tmdb");
  const sourceUrl = `https://www.themoviedb.org/company/${companyId}`;
  const agency = await prisma.agency.upsert({
    where: { name: company.name },
    update: {
      ...(logoUrl ? { logoUrl } : {}),
      ...(company.description ? { description: company.description } : {}),
      sourceUrl,
    },
    create: { name: company.name, logoUrl, description: company.description, sourceUrl },
  });
  log(`Студия: ${company.name}`);

  const shows = await fetchTmdbCompanyTvShows(companyId);
  log(`Найдено сериалов: ${shows.length}`);

  const summary: TmdbCompanySyncSummary = {
    companyName: company.name,
    totalShows: shows.length,
    dramasCreated: 0,
    dramasUpdated: 0,
    castCreated: 0,
    performersAgencyAdded: 0,
  };

  for (const [i, show] of shows.entries()) {
    const result = await importShow(show.id);
    if (result.created) summary.dramasCreated += 1;
    else summary.dramasUpdated += 1;
    summary.castCreated += result.castCreated;

    await prisma.drama.update({ where: { id: result.dramaId }, data: { agencyId: agency.id } });

    for (const performerId of result.castPerformerIds) {
      await addPerformerAgency(performerId, agency.id);
      summary.performersAgencyAdded += 1;
    }

    log(
      `[${i + 1}/${shows.length}] ${show.name} — ${result.created ? "создан" : "обновлён"}, состав: ${result.castCreated} новых, студия проставлена у ${result.castPerformerIds.length} исполнителей`,
    );
  }

  return summary;
}
