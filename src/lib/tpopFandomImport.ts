import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addMissingPerformerLinks } from "@/lib/socialLinkSync";
import { fetchTpopBandPage, fetchTpopMemberPage, type TpopBandData } from "@/lib/tpopFandom";
import { DEFAULT_FANDOM_HOST } from "@/lib/fandomWiki";
import { addPerformerAgency } from "@/lib/performerAgency";
import { downloadRemoteImage } from "@/lib/localImage";

/** Фото с фандомной вики забираем к себе (см. «Local image storage» в
 *  docs/features/tmdb-import.md) — в ту же папку, что и остальные фото
 *  исполнителей. Не скачалось — downloadRemoteImage вернёт исходную
 *  ссылку и напишет warning, импорт не падает. */
const FOLDER = "performers";

/** Строка состава для описания группы. Заводится для тех участников,
 *  под кого мы НЕ создаём запись (см. findOrCreateBandMemberPerformer):
 *  имя есть, а больше на вики ничего нет — заводить по одному имени
 *  нечего, но и терять состав жалко (правка владельца 2026-09-10:
 *  «просто группа без участников, а в описание текстом — вот участники
 *  такие-то»). Язык — как у остального синтезированного био, английский. */
export function membersSentence(names: string[]): string | null {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  return clean.length ? `Members: ${clean.join(", ")}.` : null;
}

function synthesizeBandBio(band: TpopBandData): string | null {
  const intro =
    band.genre || band.origin
      ? `${band.genre ?? "Group"}${band.origin ? ` group from ${band.origin}.` : " group."}`
      : null;
  const debut = band.debut ? `Debuted ${band.debut}${band.label ? ` under ${band.label}.` : "."}` : null;
  const sentences = [intro, debut].filter((s): s is string => !!s);
  return sentences.length ? sentences.join(" ") : null;
}

/** Сравнение имён с точностью до регистра, пробелов и дефисов — то же
 *  правило, что в поиске дублей и в матчинге состава событий. */
function loose(v: string): string {
  return v.toLowerCase().replace(/[-\s.'’]/g, "");
}

/** Что импорт решил делать с участником. */
export type MemberOutcome =
  /** Нашли и уверенно опознали — связываем. */
  | { kind: "matched"; performerId: string }
  /** Не нашли (или нашли людей, которые точно не он) — завели новую. */
  | { kind: "created"; performerId: string }
  /** На вики про человека нет ничего, кроме имени: записи не будет,
   *  имя уедет в описание группы. */
  | { kind: "name-only" }
  /** Тёзки есть, а подтвердить нечем — не гадаем, решает владелец. */
  | { kind: "ambiguous"; candidates: number };

/**
 * Участник группы → запись каталога, или НИЧЕГО.
 *
 * Правила (правка владельца 2026-09-10):
 *
 * 1. **Имя без страницы** («красная» ссылка) — не создаём и не
 *    привязываем. Раньше здесь стоял `findFirst` по имени, и участник
 *    молча привязывался к ПЕРВОМУ тёзке из каталога, а если тёзки не
 *    было — заводилась пустая запись с одним именем. Ни то, ни другое
 *    не годится: имя без даты рождения и настоящего имени — это не
 *    человек, а строка. Такие имена уходят в описание группы.
 * 2. **Со своей страницей** — привязываем, только если совпадение
 *    подтверждено НЕ ТОЛЬКО ником: настоящим именем или датой рождения.
 *    Один ник ничего не доказывает («Gun» в каталоге пятеро). Не
 *    подтвердилось — заводим нового: ложная привязка хуже дубля, дубль
 *    видно в «Дублях» и он сливается (та же доктрина, что у лайнапа
 *    фестиваля). Повторный прогон дубля не наплодит: у заведённой
 *    записи есть настоящее имя и дата, и она опознается.
 */
async function findOrCreateBandMemberPerformer(
  memberLink: { name: string; href: string },
  fallbackAgencyId: string | null,
  host: string,
): Promise<MemberOutcome> {
  if (!memberLink.href) return { kind: "name-only" };

  const member = await fetchTpopMemberPage(memberLink.href, host);

  // Кандидаты — по нику И по настоящему имени; решение о привязке
  // принимается ниже, по подтверждающим полям.
  const candidates = await prisma.performer.findMany({
    where: {
      type: "SOLO",
      OR: [
        { name: { equals: member.stageName, mode: "insensitive" } },
        ...(member.birthName
          ? [{ realName: { equals: member.birthName, mode: "insensitive" as const } }]
          : []),
      ],
    },
  });

  // «Точно он» — сошлось настоящее имя или дата рождения. Ник в
  // подтверждение не идёт: он и есть то, что путает тёзок.
  const confirmed = candidates.filter(
    (c) =>
      (member.birthName && c.realName && loose(c.realName) === loose(member.birthName)) ||
      (member.birthDate &&
        c.birthDate &&
        c.birthDate.getTime() === member.birthDate.getTime()),
  );

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

  // Подтвердить нечем — на вики нет ни настоящего имени, ни даты
  // рождения. Тогда единственный тёзка — это, скорее всего, он (и
  // отказ плодил бы новую запись на каждый прогон), а вот выбирать из
  // нескольких мы не имеем права: имя уходит владельцу.
  const nothingToConfirmWith = !member.birthName && !member.birthDate;
  const resolved =
    confirmed.length === 1
      ? confirmed
      : nothingToConfirmWith && candidates.length === 1
        ? candidates
        : [];
  if (resolved.length === 0 && nothingToConfirmWith && candidates.length > 1) {
    return { kind: "ambiguous", candidates: candidates.length };
  }

  if (resolved.length === 1) {
    const existing = resolved[0];
    // Profile fields only fill in blanks — never overwrite a manually-
    // curated or previously-imported value, same "don't clobber"
    // convention as the Wikipedia agency importer. The agency is *added*
    // to the performer's set instead (a performer can be signed to more
    // than one studio at once — see PerformerAgency in schema.prisma).
    const data: Prisma.PerformerUpdateInput = {};
    if (!existing.realName && member.birthName) data.realName = member.birthName;
    if (!existing.birthDate && member.birthDate) data.birthDate = member.birthDate;
    if (!existing.placeOfBirth && member.birthPlace) data.placeOfBirth = member.birthPlace;
    // Остальное из инфобокса и раздела «Trivia» (правка владельца
    // 2026-09-26: «по участникам прошлось, но инфу не дозаполнило») —
    // тоже только в пустое.
    if (!existing.height && member.height) data.height = member.height;
    if (!existing.weight && member.weight) data.weight = member.weight;
    if (!existing.bloodType && member.bloodType) data.bloodType = member.bloodType;
    if (existing.occupation.length === 0 && member.occupation.length > 0) data.occupation = member.occupation;
    if (existing.instruments.length === 0 && member.instruments.length > 0) data.instruments = member.instruments;
    if (!existing.soloDebut && member.soloDebut) data.soloDebut = member.soloDebut;
    if (existing.trivia.length === 0 && member.trivia.length > 0) data.trivia = member.trivia;
    if (!existing.photoUrl && member.photoUrl) {
      const local = await downloadRemoteImage(member.photoUrl, FOLDER);
      if (local) data.photoUrl = local;
    }
    if (Object.keys(data).length > 0) {
      await prisma.performer.update({ where: { id: existing.id }, data });
    }
    if (agencyId) await addPerformerAgency(existing.id, agencyId);
    // Соцсети доливаем и найденному: у карточки из другого источника
    // их могло не быть вовсе.
    await addMissingPerformerLinks(existing.id, member.socialLinks);
    return { kind: "matched", performerId: existing.id };
  }

  const created = await prisma.performer.create({
    data: {
      name: member.stageName,
      realName: member.birthName,
      birthDate: member.birthDate,
      placeOfBirth: member.birthPlace,
      photoUrl: await downloadRemoteImage(member.photoUrl, FOLDER),
      height: member.height,
      weight: member.weight,
      bloodType: member.bloodType,
      occupation: member.occupation,
      instruments: member.instruments,
      soloDebut: member.soloDebut,
      trivia: member.trivia,
      type: "SOLO",
      ...(agencyId ? { agencies: { create: { agencyId } } } : {}),
    },
  });
  await addMissingPerformerLinks(created.id, member.socialLinks);
  return { kind: "created", performerId: created.id };
}

export type TpopBandImportSummary = {
  bandName: string;
  bandCreated: boolean;
  /** Соцсети группы, долитые из инфобокса вики (правка владельца
   *  2026-09-23). У участников свои — они уходят в их карточки. */
  bandLinksAdded: number;
  membersCreated: number;
  membersMatched: number;
  /** Участники, про которых на вики только имя: записей под них нет,
   *  имена ушли в описание группы (правка владельца 2026-09-10). */
  membersInBioOnly: number;
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
  /** С какой вики Fandom берём страницы. Ссылки на участников внутри
   *  статьи относительные — хост им передаём мы. */
  host: string = DEFAULT_FANDOM_HOST,
): Promise<TpopBandImportSummary> {
  const log = onProgress ?? (() => {});
  const band = await fetchTpopBandPage(pageUrlOrTitle, host);
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
    if (!existingBand.photoUrl && band.photoUrl) {
      const local = await downloadRemoteImage(band.photoUrl, FOLDER);
      if (local) data.photoUrl = local;
    }
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
        photoUrl: await downloadRemoteImage(band.photoUrl, FOLDER),
        ...(agency ? { agencies: { create: { agencyId: agency.id } } } : {}),
      },
    });
    bandPerformerId = created.id;
    bandCreated = true;
  }
  // Соцсети группы — из её инфобокса; у участников свои, они долиты
  // в importMember выше.
  const bandLinks = await addMissingPerformerLinks(bandPerformerId, band.socialLinks);

  let membersCreated = 0;
  let membersMatched = 0;
  const bioOnlyNames: string[] = [];
  for (const [i, memberLink] of band.members.entries()) {
    const outcome = await findOrCreateBandMemberPerformer(memberLink, agency?.id ?? null, host);
    if (outcome.kind === "name-only" || outcome.kind === "ambiguous") {
      // И то, и другое кончается одинаково: записи нет, имя не теряем —
      // уходит в описание группы. Разница только в причине, и она видна
      // в журнале прогона.
      bioOnlyNames.push(memberLink.name);
      log(
        `[Участники ${i + 1}/${band.members.length}] ${memberLink.name} — ` +
          (outcome.kind === "name-only"
            ? "на вики только имя, запись не заводим, имя уйдёт в описание"
            : `в каталоге ${outcome.candidates} тёзки и подтвердить нечем — ` +
              "не гадаем, имя уйдёт в описание"),
      );
      continue;
    }
    if (outcome.kind === "created") membersCreated += 1;
    else membersMatched += 1;

    await prisma.bandMember.upsert({
      where: { bandId_performerId: { bandId: bandPerformerId, performerId: outcome.performerId } },
      update: {},
      create: { bandId: bandPerformerId, performerId: outcome.performerId },
    });
    log(
      `[Участники ${i + 1}/${band.members.length}] ${memberLink.name} — ` +
        `${outcome.kind === "created" ? "создан" : "найден"}`,
    );
  }

  // Состав, оставшийся без записей, дописываем в описание — иначе он
  // просто потерялся бы. Строку добавляем, а не переписываем чужой
  // текст, и только если её там ещё нет (повторный прогон не плодит
  // копий).
  const membersLine = membersSentence(bioOnlyNames);
  if (membersLine) {
    const current =
      (await prisma.performer.findUnique({
        where: { id: bandPerformerId },
        select: { bio: true },
      }))?.bio ?? null;
    if (!current?.includes(membersLine)) {
      await prisma.performer.update({
        where: { id: bandPerformerId },
        data: { bio: [current, membersLine].filter(Boolean).join(" ") },
      });
    }
  }

  return {
    bandName: band.name,
    bandCreated,
    bandLinksAdded: bandLinks.added,
    membersCreated,
    membersMatched,
    membersInBioOnly: bioOnlyNames.length,
  };
}
