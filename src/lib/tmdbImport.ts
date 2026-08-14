import { prisma } from "@/lib/prisma";
import type { DramaStatus } from "@/generated/prisma/client";
import {
  fetchTmdbPerson,
  fetchTmdbPersonKnownForTv,
  fetchTmdbTvShow,
  fetchTmdbTvCredits,
  type TmdbKnownForShow,
} from "@/lib/tmdb";

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

  const created = await prisma.performer.create({
    data: {
      name: cast.name,
      realName: cast.name,
      type: "SOLO",
      tmdbId,
      photoUrl: cast.photoUrl,
    },
  });
  return { id: created.id, created: true };
}

async function importShow(tvId: number): Promise<{ dramaId: string; created: boolean; castCreated: number }> {
  const [show, credits] = await Promise.all([fetchTmdbTvShow(tvId), fetchTmdbTvCredits(tvId)]);
  const tmdbId = String(show.id);

  const existing = await prisma.drama.findFirst({
    where: {
      OR: [{ tmdbId }, { title: { equals: show.name, mode: "insensitive" } }],
    },
  });

  const dramaData = {
    title: show.name,
    synopsis: show.overview,
    posterUrl: show.posterUrl,
    year: show.year,
    status: show.status,
    tmdbId,
  };

  const drama = existing
    ? await prisma.drama.update({ where: { id: existing.id }, data: dramaData })
    : await prisma.drama.create({ data: dramaData });

  let castCreated = 0;
  for (const member of credits) {
    const { id: performerId, created } = await findOrCreateCastPerformer(member);
    if (created) castCreated += 1;

    await prisma.performerDrama.upsert({
      where: { performerId_dramaId: { performerId, dramaId: drama.id } },
      update: { role: member.character || null },
      create: { performerId, dramaId: drama.id, role: member.character || null },
    });
  }

  return { dramaId: drama.id, created: !existing, castCreated };
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
  await prisma.performer.update({
    where: { id: input.performerId },
    data: {
      tmdbId: input.tmdbPersonId,
      placeOfBirth: input.placeOfBirth || null,
    },
  });

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
