import { prisma } from "@/lib/prisma";
import { fetchTpopBandPage, fetchTpopMemberPage, type TpopBandData } from "@/lib/tpopFandom";
import { addPerformerAgency } from "@/lib/performerAgency";

function synthesizeBandBio(band: TpopBandData): string | null {
  const intro =
    band.genre || band.origin
      ? `${band.genre ?? "Group"}${band.origin ? ` group from ${band.origin}.` : " group."}`
      : null;
  const debut = band.debut ? `Debuted ${band.debut}${band.label ? ` under ${band.label}.` : "."}` : null;
  const sentences = [intro, debut].filter((s): s is string => !!s);
  return sentences.length ? sentences.join(" ") : null;
}

async function findOrCreateBandMemberPerformer(
  memberLink: { name: string; href: string },
  fallbackAgencyId: string | null,
): Promise<{ performerId: string; created: boolean }> {
  // «Красная» ссылка — своей страницы у участника нет: ищем/создаём по
  // имени из списка, без фетча.
  if (!memberLink.href) {
    const existingByName = await prisma.performer.findFirst({
      where: { name: { equals: memberLink.name, mode: "insensitive" } },
    });
    if (existingByName) {
      if (fallbackAgencyId) await addPerformerAgency(existingByName.id, fallbackAgencyId);
      return { performerId: existingByName.id, created: false };
    }
    const created = await prisma.performer.create({
      data: {
        name: memberLink.name,
        type: "SOLO",
        ...(fallbackAgencyId ? { agencies: { create: { agencyId: fallbackAgencyId } } } : {}),
      },
    });
    return { performerId: created.id, created: true };
  }

  const member = await fetchTpopMemberPage(memberLink.href);

  const existing = await prisma.performer.findFirst({
    where: {
      OR: [
        { name: { equals: member.stageName, mode: "insensitive" } },
        ...(member.birthName ? [{ realName: { equals: member.birthName, mode: "insensitive" as const } }] : []),
      ],
    },
  });

  // The member's own page may not list an "Agency" field at all (some
  // pages just don't fill it in) — falling back to the band's own label
  // is still correct, since being in the band's current lineup implies
  // being signed to it.
  let agencyId = fallbackAgencyId;
  if (member.agency) {
    const agency = await prisma.agency.upsert({
      where: { name: member.agency },
      update: {},
      create: { name: member.agency },
    });
    agencyId = agency.id;
  }

  if (existing) {
    // Profile fields only fill in blanks — never overwrite a manually-
    // curated or previously-imported value, same "don't clobber"
    // convention as the Wikipedia agency importer. The agency is *added*
    // to the performer's set instead (a performer can be signed to more
    // than one studio at once — see PerformerAgency in schema.prisma).
    const data: { realName?: string; birthDate?: Date; placeOfBirth?: string; photoUrl?: string } = {};
    if (!existing.realName && member.birthName) data.realName = member.birthName;
    if (!existing.birthDate && member.birthDate) data.birthDate = member.birthDate;
    if (!existing.placeOfBirth && member.birthPlace) data.placeOfBirth = member.birthPlace;
    if (!existing.photoUrl && member.photoUrl) data.photoUrl = member.photoUrl;
    if (Object.keys(data).length > 0) {
      await prisma.performer.update({ where: { id: existing.id }, data });
    }
    if (agencyId) await addPerformerAgency(existing.id, agencyId);
    return { performerId: existing.id, created: false };
  }

  const created = await prisma.performer.create({
    data: {
      name: member.stageName,
      realName: member.birthName,
      birthDate: member.birthDate,
      placeOfBirth: member.birthPlace,
      photoUrl: member.photoUrl,
      type: "SOLO",
      ...(agencyId ? { agencies: { create: { agencyId } } } : {}),
    },
  });
  return { performerId: created.id, created: true };
}

export type TpopBandImportSummary = {
  bandName: string;
  bandCreated: boolean;
  membersCreated: number;
  membersMatched: number;
};

/** Imports one tpop.fandom.com idol-group article: upserts the band as a
 *  `Performer` (type BAND — bio synthesized from Origin/Genre/Debut/
 *  Label since the schema has no dedicated fields for those), upserts
 *  its label as an `Agency`, and for every member in its *current*
 *  lineup fetches their own page for birth name/date/place/photo/agency,
 *  matches or creates a `Performer` (type SOLO), then links them via
 *  `BandMember`. No review step — same dedup-and-report shape as the
 *  Wikipedia/GMMTV bulk importers. */
export async function importTpopBand(
  pageUrlOrTitle: string,
  onProgress?: (message: string) => void,
): Promise<TpopBandImportSummary> {
  const log = onProgress ?? (() => {});
  const band = await fetchTpopBandPage(pageUrlOrTitle);
  log(`Группа: ${band.name}`);

  const agency = band.label
    ? await prisma.agency.upsert({ where: { name: band.label }, update: {}, create: { name: band.label } })
    : null;
  const bio = synthesizeBandBio(band);

  const existingBand = await prisma.performer.findFirst({
    where: { name: { equals: band.name, mode: "insensitive" }, type: "BAND" },
  });

  let bandPerformerId: string;
  let bandCreated: boolean;
  if (existingBand) {
    const data: { bio?: string; photoUrl?: string } = {};
    if (!existingBand.bio && bio) data.bio = bio;
    if (!existingBand.photoUrl && band.photoUrl) data.photoUrl = band.photoUrl;
    if (Object.keys(data).length > 0) {
      await prisma.performer.update({ where: { id: existingBand.id }, data });
    }
    if (agency) await addPerformerAgency(existingBand.id, agency.id);
    bandPerformerId = existingBand.id;
    bandCreated = false;
  } else {
    const created = await prisma.performer.create({
      data: {
        name: band.name,
        type: "BAND",
        bio,
        photoUrl: band.photoUrl,
        ...(agency ? { agencies: { create: { agencyId: agency.id } } } : {}),
      },
    });
    bandPerformerId = created.id;
    bandCreated = true;
  }

  let membersCreated = 0;
  let membersMatched = 0;
  for (const [i, memberLink] of band.members.entries()) {
    const { performerId, created } = await findOrCreateBandMemberPerformer(memberLink, agency?.id ?? null);
    if (created) membersCreated += 1;
    else membersMatched += 1;

    await prisma.bandMember.upsert({
      where: { bandId_performerId: { bandId: bandPerformerId, performerId } },
      update: {},
      create: { bandId: bandPerformerId, performerId },
    });
    log(`[Участники ${i + 1}/${band.members.length}] ${memberLink.name} — ${created ? "создан" : "найден"}`);
  }

  return { bandName: band.name, bandCreated, membersCreated, membersMatched };
}
