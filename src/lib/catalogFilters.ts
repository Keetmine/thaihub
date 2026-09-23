import { unstable_cache } from "next/cache";
import type { ContentDict } from "@/lib/contentDictionary";
import { prisma } from "@/lib/prisma";
import { CATALOG_TAG } from "@/lib/catalogCache";
import type { Prisma } from "@/generated/prisma/client";
import { premiumActiveWhere, premiumInactiveWhere } from "@/lib/premium";
import type { Dict } from "@/lib/i18n";

/**
 * Фильтры каталогов — одно место для публичного поиска (/search) и
 * админских списков (И1 + И6).
 *
 * Устройство сознательно трёхчастное, и границы важны:
 *
 * - ОПИСАНИЯ (`…FilterDefs`) — что за фильтры есть у сущности: ключ,
 *   вид контрола, варианты. Сериализуемы целиком, поэтому их можно
 *   отдать клиентской панели как пропсы. Подписи приходят из словаря
 *   уже переведёнными: публичная страница даёт словарь зрителя,
 *   админка — русский (`getDict("ru")`, весь её интерфейс такой).
 *
 * - ВАРИАНТЫ (`load…FilterOptions`) — списки значений из базы: жанры,
 *   страны, каналы. Это данные каталога, они не переводятся. Считаются
 *   раз в полчаса (unstable_cache + CATALOG_TAG — правка каталога
 *   сбрасывает раньше): distinct по четырём тысячам строк на каждый
 *   рендер был бы расточительством.
 *
 * - СБОРКА WHERE (`…FilterWhere`) — из параметров адреса в условия
 *   Prisma. Возвращает МАССИВ условий: вызывающая страница складывает
 *   их со своими (поиск по названию, вкладки, issue=) через AND, ничего
 *   не зная о внутренностях.
 *
 * Все значения фильтров живут в адресе (`?genres=Romance,Drama&
 * yearFrom=2020`) — срез можно положить в закладки и переслать.
 *
 * Семантика внутри одного фильтра: жанры и теги — «И» (hasEvery:
 * выбрал «романтика» и «школа» — получил сериалы, где есть ОБА, как на
 * MDL); страна/тип/статус/канал — «ИЛИ» (in: это взаимоисключающие
 * значения, «И» между ними всегда пуст).
 */

export type FilterOption = { value: string; label: string };

export type FilterDef = {
  key: string;
  title: string;
  kind: "multi" | "select" | "yearRange" | "dateRange" | "text" | "flag";
  options?: FilterOption[];
  /** multi: список длинный (теги — сотни) — рисовать с поиском внутри. */
  searchable?: boolean;
  /** yearRange: подсказки границ в плейсхолдерах. */
  min?: number;
  max?: number;
  /** Короткая подсказка под заголовком группы. */
  hint?: string;
  /** Свёрнута по умолчанию (агентства, теги); при активном значении
   *  группа открывается сама. */
  collapsed?: boolean;
  /** multi «плашками» (теги): поле поиска, подходящие значения — рядом
   *  кликабельными плашками, выбранные — снимаемыми плашками ПОД полем.
   *  Чекбоксов и столбцов нет — значений сотни. */
  chipStyle?: boolean;
  /** Показывать группу даже без вариантов — с пометкой «значений пока
   *  нет» (страна: заполняется по мере переимпорта). */
  alwaysShow?: boolean;
};

export type FilterParams = Record<string, string | string[] | undefined>;

/** Значение параметра адреса: Next отдаёт string | string[]. */
function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function csv(v: string | string[] | undefined): string[] {
  return one(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function intOrNull(v: string | string[] | undefined): number | null {
  const n = Number.parseInt(one(v), 10);
  return Number.isFinite(n) ? n : null;
}

/** «2026-08-28» из date-инпута → полночь UTC (даты в проекте настенные). */
function dateOrNull(v: string | string[] | undefined): Date | null {
  const m = one(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Сколько фильтров сущности активно в адресе — для «Фильтры (N)». */
export function countActiveFilters(defs: FilterDef[], params: FilterParams): number {
  let n = 0;
  for (const def of defs) {
    if (def.kind === "yearRange" || def.kind === "dateRange") {
      if (one(params[`${def.key}From`]) || one(params[`${def.key}To`])) n += 1;
    } else if (one(params[def.key])) {
      n += 1;
    }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Сериалы                                                             */
/* ------------------------------------------------------------------ */

export const loadDramaFilterOptions = unstable_cache(
  async () => {
    const [genres, tags, countries, types, statuses, networks, agencies, years] =
      await Promise.all([
        prisma.$queryRaw<{ v: string }[]>`
          SELECT DISTINCT unnest(genres) AS v FROM "Drama" ORDER BY v`,
        prisma.$queryRaw<{ v: string }[]>`
          SELECT DISTINCT unnest(tags) AS v FROM "Drama" ORDER BY v`,
        prisma.drama.findMany({
          where: { country: { not: null } },
          distinct: ["country"],
          select: { country: true },
          orderBy: { country: "asc" },
        }),
        prisma.drama.findMany({
          where: { type: { not: null } },
          distinct: ["type"],
          select: { type: true },
          orderBy: { type: "asc" },
        }),
        prisma.drama.findMany({
          where: { status: { not: null } },
          distinct: ["status"],
          select: { status: true },
        }),
        prisma.drama.findMany({
          where: { network: { not: null } },
          distinct: ["network"],
          select: { network: true },
          orderBy: { network: "asc" },
        }),
        // Только агентства, у которых есть сериалы: пустые варианты в
        // фильтре — это варианты, дающие гарантированный ноль.
        prisma.agency.findMany({
          where: { OR: [{ dramas: { some: {} } }, { dramaLinks: { some: {} } }] },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.drama.aggregate({ _min: { year: true }, _max: { year: true } }),
      ]);
    return {
      genres: genres.map((g) => g.v),
      tags: tags.map((t) => t.v),
      countries: countries.map((c) => c.country!),
      types: types.map((t) => t.type!),
      statuses: statuses.map((s) => s.status!),
      networks: networks.map((n) => n.network!),
      agencies: agencies.map((a) => ({ id: a.id, name: a.name })),
      yearMin: years._min.year ?? 1990,
      yearMax: years._max.year ?? new Date().getFullYear() + 1,
    };
  },
  ["drama-filter-options"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

export type DramaFilterOptions = Awaited<ReturnType<typeof loadDramaFilterOptions>>;

export function dramaFilterDefs(
  t: Dict,
  o: DramaFilterOptions,
  /** Словарь повторяющихся значений: подписи жанров, стран и типов
   *  правит владелец в админке (см. contentDictionary.ts). Значения в
   *  фильтре остаются СЫРЫМИ — по ним ищет каталог. */
  contentDict: ContentDict,
): FilterDef[] {
  const plain = (values: string[]) => values.map((v) => ({ value: v, label: v }));
  // Канала здесь нет сознательно (правка владельца): зрителю он мало
  // что говорит. В админке остаётся — adminDramaFilterDefs.
  return [
    {
      key: "year",
      title: t.filters.year,
      kind: "yearRange",
      min: o.yearMin,
      max: o.yearMax,
      hint: t.filters.hints.year,
    },
    {
      key: "genres",
      title: t.filters.genres,
      kind: "multi",
      // ЗНАЧЕНИЕ остаётся сырым — по нему ищет каталог и живут ссылки;
      // переводится только подпись (правка владельца 2026-09-10).
      options: o.genres.map((v) => ({ value: v, label: contentDict.genre(v) })),
      hint: t.filters.hints.genres,
    },
    {
      key: "country",
      title: t.filters.country,
      kind: "multi",
      options: o.countries.map((v) => ({ value: v, label: contentDict.country(v) })),
      hint: t.filters.hints.country,
      alwaysShow: true,
    },
    {
      key: "type",
      title: t.filters.type,
      kind: "multi",
      options: o.types.map((v) => ({ value: v, label: contentDict.dramaType(v) })),
      hint: t.filters.hints.type,
    },
    {
      key: "status",
      title: t.filters.status,
      kind: "select",
      options: o.statuses.map((s) => ({ value: s, label: t.catalog.dramaStatus[s] })),
      hint: t.filters.hints.status,
    },
    {
      key: "agency",
      title: t.filters.agency,
      kind: "multi",
      options: o.agencies.map((a) => ({ value: a.id, label: a.name })),
      collapsed: true,
      hint: t.filters.hints.agency,
    },
    {
      key: "tags",
      title: t.filters.tags,
      kind: "multi",
      options: plain(o.tags),
      chipStyle: true,
      collapsed: true,
      hint: t.filters.hints.tags,
    },
  ];
}

export function dramaFilterWhere(p: FilterParams): Prisma.DramaWhereInput[] {
  const w: Prisma.DramaWhereInput[] = [];
  const genres = csv(p.genres);
  if (genres.length) w.push({ genres: { hasEvery: genres } });
  const tags = csv(p.tags);
  if (tags.length) w.push({ tags: { hasEvery: tags } });
  const countries = csv(p.country);
  if (countries.length) w.push({ country: { in: countries } });
  const types = csv(p.type);
  if (types.length) w.push({ type: { in: types } });
  // Enum нельзя пропускать в запрос как есть: адрес пишет кто угодно, и
  // чужая строка уронила бы запрос Prisma целиком.
  const statusValues = csv(p.status).filter((s) =>
    ["RETURNING_SERIES", "PLANNED", "IN_PRODUCTION", "ENDED", "CANCELED", "PILOT"].includes(s),
  ) as ("RETURNING_SERIES" | "PLANNED" | "IN_PRODUCTION" | "ENDED" | "CANCELED" | "PILOT")[];
  if (statusValues.length) w.push({ status: { in: statusValues } });
  const networks = csv(p.network);
  if (networks.length) w.push({ network: { in: networks } });
  const agencyIds = csv(p.agency);
  if (agencyIds.length) {
    // У сериала два вида связи с агентством — старая одиночная и
    // новая многие-ко-многим; фильтр обязан видеть обе.
    w.push({
      OR: [
        { agencyId: { in: agencyIds } },
        { agencies: { some: { agencyId: { in: agencyIds } } } },
      ],
    });
  }
  const yearFrom = intOrNull(p.yearFrom);
  if (yearFrom !== null) w.push({ year: { gte: yearFrom } });
  const yearTo = intOrNull(p.yearTo);
  if (yearTo !== null) w.push({ year: { lte: yearTo } });
  return w;
}

export function dramaSortOrder(sort: string): Prisma.DramaOrderByWithRelationInput[] {
  if (sort === "rating") return [{ mdlScore: { sort: "desc", nulls: "last" } }, { title: "asc" }];
  if (sort === "title") return [{ title: "asc" }];
  return [{ year: { sort: "desc", nulls: "last" } }, { title: "asc" }];
}

/* ------------------------------------------------------------------ */
/* Артисты                                                             */
/* ------------------------------------------------------------------ */

export const loadPerformerFilterOptions = unstable_cache(
  async () => {
    const [agencies, nationalities, years] = await Promise.all([
      prisma.agency.findMany({
        where: { performers: { some: {} } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.performer.findMany({
        where: { nationality: { not: null } },
        distinct: ["nationality"],
        select: { nationality: true },
        orderBy: { nationality: "asc" },
      }),
      prisma.$queryRaw<{ min: number | null; max: number | null }[]>`
        SELECT EXTRACT(YEAR FROM MIN("birthDate"))::int AS min,
               EXTRACT(YEAR FROM MAX("birthDate"))::int AS max
          FROM "Performer" WHERE "birthDate" IS NOT NULL`,
    ]);
    return {
      agencies: agencies.map((a) => ({ id: a.id, name: a.name })),
      nationalities: nationalities.map((n) => n.nationality!),
      birthYearMin: years[0]?.min ?? 1950,
      birthYearMax: years[0]?.max ?? new Date().getFullYear(),
    };
  },
  ["performer-filter-options"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

export type PerformerFilterOptions = Awaited<ReturnType<typeof loadPerformerFilterOptions>>;

export function performerFilterDefs(t: Dict, o: PerformerFilterOptions): FilterDef[] {
  return [
    {
      key: "kind",
      title: t.filters.performerKind,
      kind: "multi",
      options: (["SOLO", "BAND", "MASCOT"] as const).map((v) => ({
        value: v,
        label: t.filters.performerKinds[v],
      })),
      hint: t.filters.hints.performerKind,
    },
    {
      key: "agency",
      title: t.filters.agency,
      kind: "multi",
      options: o.agencies.map((a) => ({ value: a.id, label: a.name })),
      collapsed: true,
      hint: t.filters.hints.agency,
    },
    {
      key: "birthYear",
      title: t.filters.birthYear,
      kind: "yearRange",
      min: o.birthYearMin,
      max: o.birthYearMax,
      hint: t.filters.hints.year,
    },
  ];
}

export function performerFilterWhere(p: FilterParams): Prisma.PerformerWhereInput[] {
  const w: Prisma.PerformerWhereInput[] = [];
  const kinds = csv(p.kind).filter((k) => ["SOLO", "BAND", "MASCOT"].includes(k)) as (
    | "SOLO"
    | "BAND"
    | "MASCOT"
  )[];
  if (kinds.length) w.push({ type: { in: kinds } });
  const agencyIds = csv(p.agency);
  if (agencyIds.length) w.push({ agencies: { some: { agencyId: { in: agencyIds } } } });
  const birthYearFrom = intOrNull(p.birthYearFrom);
  if (birthYearFrom !== null) w.push({ birthDate: { gte: new Date(Date.UTC(birthYearFrom, 0, 1)) } });
  const birthYearTo = intOrNull(p.birthYearTo);
  if (birthYearTo !== null) w.push({ birthDate: { lt: new Date(Date.UTC(birthYearTo + 1, 0, 1)) } });
  return w;
}

/* ------------------------------------------------------------------ */
/* События                                                             */
/* ------------------------------------------------------------------ */

/** Теги событий для фильтра — все, что есть в каталоге. Список редкий и
 *  живёт долго, поэтому кэш такой же, как у сериальных вариантов. */
export const loadEventFilterOptions = unstable_cache(
  async () => {
    const tags = await prisma.$queryRaw<{ v: string }[]>`
      SELECT DISTINCT unnest(tags) AS v FROM "Event" ORDER BY v`;
    return { tags: tags.map((r) => r.v) };
  },
  ["event-filter-options"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

export type EventFilterOptions = Awaited<ReturnType<typeof loadEventFilterOptions>>;

export function eventFilterDefs(t: Dict, o: EventFilterOptions): FilterDef[] {
  return [
    {
      key: "when",
      title: t.filters.eventWhen,
      kind: "select",
      options: [
        { value: "upcoming", label: t.filters.eventWhenOptions.upcoming },
        { value: "past", label: t.filters.eventWhenOptions.past },
      ],
    },
    { key: "date", title: t.filters.date, kind: "dateRange", hint: t.filters.hints.date },
    { key: "venue", title: t.filters.venue, kind: "text", hint: t.filters.hints.venue },
    // Теги события (жанры фестиваля, вид мероприятия): с ними чипы на
    // странице события стали входом в поиск — как жанры у сериалов
    // (правка владельца 2026-09-06).
    ...(o.tags.length > 0
      ? [
          {
            key: "tags",
            title: t.filters.tags,
            kind: "multi" as const,
            options: o.tags.map((v) => ({ value: v, label: v })),
            hint: t.filters.hints.tags,
          },
        ]
      : []),
  ];
}

export function eventFilterWhere(p: FilterParams, now = new Date()): Prisma.EventWhereInput[] {
  const w: Prisma.EventWhereInput[] = [];
  const when = one(p.when);
  if (when === "upcoming") w.push({ occurrences: { some: { startsAt: { gte: now } } } });
  if (when === "past") w.push({ occurrences: { every: { startsAt: { lt: now } } } });
  const from = dateOrNull(p.dateFrom);
  if (from) w.push({ occurrences: { some: { startsAt: { gte: from } } } });
  const to = dateOrNull(p.dateTo);
  // «по 28.08» включает весь день 28-го — верхняя граница со следующей
  // полуночи.
  if (to) {
    const next = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    w.push({ occurrences: { some: { startsAt: { lt: next } } } });
  }
  const venue = one(p.venue);
  if (venue) w.push({ venue: { contains: venue, mode: "insensitive" } });
  // Как у сериалов: несколько тегов сужают выдачу, а не расширяют её.
  const tags = csv(p.tags);
  if (tags.length) w.push({ tags: { hasEvery: tags } });
  return w;
}

/* ------------------------------------------------------------------ */
/* Локации                                                             */
/* ------------------------------------------------------------------ */

export function locationFilterDefs(t: Dict): FilterDef[] {
  return [{ key: "onMap", title: t.filters.onMap, kind: "flag" }];
}

export function locationFilterWhere(p: FilterParams): Prisma.LocationWhereInput[] {
  const w: Prisma.LocationWhereInput[] = [];
  if (one(p.onMap) === "1") w.push({ latitude: { not: null } });
  return w;
}

/* ------------------------------------------------------------------ */
/* Новеллы                                                             */
/* ------------------------------------------------------------------ */

export const loadNovelFilterOptions = unstable_cache(
  async () => {
    const tags = await prisma.$queryRaw<{ v: string }[]>`
      SELECT DISTINCT unnest(tags) AS v FROM "Novel" ORDER BY v`;
    return { tags: tags.map((t) => t.v) };
  },
  ["novel-filter-options"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

export type NovelFilterOptions = Awaited<ReturnType<typeof loadNovelFilterOptions>>;

export function novelFilterDefs(t: Dict, o: NovelFilterOptions): FilterDef[] {
  return [
    {
      key: "tags",
      title: t.filters.tags,
      kind: "multi",
      options: o.tags.map((v) => ({ value: v, label: v })),
      chipStyle: true,
      collapsed: true,
      hint: t.filters.hints.tags,
    },
    { key: "hasAdaptation", title: t.filters.hasAdaptation, kind: "flag" },
  ];
}

export function novelFilterWhere(p: FilterParams): Prisma.NovelWhereInput[] {
  const w: Prisma.NovelWhereInput[] = [];
  const tags = csv(p.tags);
  if (tags.length) w.push({ tags: { hasEvery: tags } });
  if (one(p.hasAdaptation) === "1") w.push({ dramas: { some: {} } });
  return w;
}

/* ------------------------------------------------------------------ */
/* Музыка                                                              */
/*                                                                     */
/* Особый случай: витрина /music склеивает ДВЕ таблицы — альбомы и     */
/* самостоятельные песни. Поэтому здесь не один массив условий, а по   */
/* массиву на половину, и признак «половина отключена фильтром типа»   */
/* (null) — выбрали «Альбом», значит песни не запрашиваем вовсе.       */
/* ------------------------------------------------------------------ */

/** Псевдотип для отдельной песни: в базе такого значения нет (у Song   *
 *  нет поля type), но в фильтре «Альбом / Мини-альбом / Сингл / Песня» *
 *  человеку он нужен наравне с остальными. */
const SONG_TYPE = "SONG";

/** Значения AlbumType — списком, чтобы отфильтровать мусор из адреса:
 *  `?releaseType=DROP TABLE` не должен доехать до Prisma. */
const ALBUM_TYPES = ["ALBUM", "EP", "SINGLE"] as const;
type AlbumTypeValue = (typeof ALBUM_TYPES)[number];

export const loadMusicFilterOptions = unstable_cache(
  async () => {
    const [performers, albumYears, songYears] = await Promise.all([
      // Только те, у кого есть что показать: артист без релизов — это
      // вариант фильтра с гарантированным нулём.
      prisma.performer.findMany({
        where: { OR: [{ albums: { some: {} } }, { songs: { some: { albumId: null } } }] },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.album.aggregate({ _min: { year: true }, _max: { year: true } }),
      prisma.song.aggregate({ _min: { year: true }, _max: { year: true } }),
    ]);
    const now = new Date().getUTCFullYear();
    const mins = [albumYears._min.year, songYears._min.year].filter((y): y is number => !!y);
    const maxs = [albumYears._max.year, songYears._max.year].filter((y): y is number => !!y);
    return {
      performers: performers.map((p) => ({ id: p.id, name: p.name })),
      yearMin: mins.length ? Math.min(...mins) : 1990,
      yearMax: maxs.length ? Math.max(...maxs) : now,
    };
  },
  ["music-filter-options"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

export type MusicFilterOptions = Awaited<ReturnType<typeof loadMusicFilterOptions>>;

export function musicFilterDefs(t: Dict, o: MusicFilterOptions): FilterDef[] {
  return [
    {
      key: "performer",
      title: t.filters.performer,
      kind: "multi",
      // Исполнителей полторы сотни — чекбоксами это стена, поэтому тот
      // же приём, что у тегов: поиск и плашки.
      options: o.performers.map((p) => ({ value: p.id, label: p.name })),
      chipStyle: true,
      hint: t.filters.hints.performer,
    },
    {
      key: "year",
      title: t.filters.year,
      kind: "yearRange",
      min: o.yearMin,
      max: o.yearMax,
      hint: t.filters.hints.year,
    },
    {
      key: "releaseType",
      title: t.filters.releaseType,
      kind: "multi",
      options: [
        { value: "ALBUM", label: t.catalog.albumType.ALBUM },
        { value: "EP", label: t.catalog.albumType.EP },
        { value: "SINGLE", label: t.catalog.albumType.SINGLE },
        { value: SONG_TYPE, label: t.catalog.songType },
      ],
      hint: t.filters.hints.releaseType,
    },
  ];
}

export type MusicFilterWhere = {
  /** Условия для альбомов; `null` — фильтр типа выключил эту половину. */
  albums: Prisma.AlbumWhereInput[] | null;
  /** То же для самостоятельных песен. */
  songs: Prisma.SongWhereInput[] | null;
  /** Год выбран руками — витрина снимает своё окно свежести и слушает
   *  человека (см. getMusicNews в lib/whatsNew.ts). */
  yearPicked: boolean;
};

export function musicFilterWhere(p: FilterParams): MusicFilterWhere {
  const performers = csv(p.performer);
  const types = csv(p.releaseType);
  const yearFrom = intOrNull(p.yearFrom);
  const yearTo = intOrNull(p.yearTo);

  const common: (Prisma.AlbumWhereInput & Prisma.SongWhereInput)[] = [];
  if (performers.length) common.push({ performerId: { in: performers } });
  if (yearFrom !== null || yearTo !== null) {
    common.push({
      year: {
        ...(yearFrom !== null ? { gte: yearFrom } : {}),
        ...(yearTo !== null ? { lte: yearTo } : {}),
      },
    });
  }

  const albumTypes = types.filter((v): v is AlbumTypeValue =>
    (ALBUM_TYPES as readonly string[]).includes(v),
  );
  const wantsAlbums = types.length === 0 || albumTypes.length > 0;
  const wantsSongs = types.length === 0 || types.includes(SONG_TYPE);

  return {
    albums: wantsAlbums
      ? [...common, ...(albumTypes.length ? [{ type: { in: albumTypes } }] : [])]
      : null,
    songs: wantsSongs ? [...common] : null,
    yearPicked: yearFrom !== null || yearTo !== null,
  };
}

/* ------------------------------------------------------------------ */
/* Админские дополнения                                                */
/*                                                                     */
/* Публичные фильтры — про «что искать», админские флаги — про «что    */
/* чинить»: нет постера, нет каста, нет связи с MDL. Зрителю такие     */
/* срезы не нужны, владельцу они — рабочий список на день.             */
/* ------------------------------------------------------------------ */

export function adminDramaFilterDefs(
  t: Dict,
  o: DramaFilterOptions,
  contentDict: ContentDict,
): FilterDef[] {
  return [
    ...dramaFilterDefs(t, o, contentDict),
    // Канал скрыт с публичной страницы, но владельцу нужен.
    {
      key: "network",
      title: t.filters.network,
      kind: "multi",
      options: o.networks.map((v) => ({ value: v, label: v })),
      collapsed: true,
    },
    { key: "noCountry", title: "Без страны", kind: "flag" },
    { key: "noRu", title: "Нет ру перевода", kind: "flag" },
    { key: "noPoster", title: "Без постера", kind: "flag" },
    { key: "noCast", title: "Без каста", kind: "flag" },
    { key: "noMdl", title: "Без связи с MDL", kind: "flag" },
  ];
}

export function adminDramaFilterWhere(p: FilterParams): Prisma.DramaWhereInput[] {
  const w = dramaFilterWhere(p);
  if (one(p.noCountry) === "1") w.push({ OR: [{ country: null }, { country: "" }] });
  if (one(p.noRu) === "1") w.push({ titleRu: null });
  if (one(p.noPoster) === "1") w.push({ OR: [{ posterUrl: null }, { posterUrl: "" }] });
  if (one(p.noCast) === "1") w.push({ performers: { none: {} } });
  if (one(p.noMdl) === "1") w.push({ mdlUrl: null, mydramalistUrl: null });
  return w;
}

export function adminPerformerFilterDefs(t: Dict, o: PerformerFilterOptions): FilterDef[] {
  return [
    // Вид (актёр/группа/маскот) в админке уже выбран вкладками раздела —
    // второй такой же фильтр только путал бы.
    ...performerFilterDefs(t, o).filter((d) => d.key !== "kind"),
    // Страна (nationality), а не место рождения — правка владельца.
    {
      key: "nationality",
      title: t.filters.country,
      kind: "multi",
      options: o.nationalities.map((v) => ({ value: v, label: v })),
      alwaysShow: true,
      hint: t.filters.hints.country,
    },
    { key: "noPhoto", title: "Без фото", kind: "flag" },
    { key: "noBirthDate", title: "Без даты рождения", kind: "flag" },
    // Заведены парсером с одним именем (лайнапы musicfestival.in.th) и
    // ждут заполнения — см. docs/features/musicfestival-import.md.
    { key: "stub", title: "Заготовки парсеров (без данных)", kind: "flag" },
  ];
}

export function adminPerformerFilterWhere(p: FilterParams): Prisma.PerformerWhereInput[] {
  const w = performerFilterWhere(p);
  const nationalities = csv(p.nationality);
  if (nationalities.length) w.push({ nationality: { in: nationalities } });
  if (one(p.noPhoto) === "1") w.push({ OR: [{ photoUrl: null }, { photoUrl: "" }] });
  if (one(p.noBirthDate) === "1") w.push({ birthDate: null });
  if (one(p.stub) === "1") w.push({ stub: true });
  return w;
}

export function adminEventFilterDefs(t: Dict, o: EventFilterOptions): FilterDef[] {
  return [
    // «Когда» в админке уже выбрано вкладками «Текущие/Архив».
    ...eventFilterDefs(t, o).filter((d) => d.key !== "when"),
    { key: "noPoster", title: "Без постера", kind: "flag" },
    { key: "noCast", title: "Без состава", kind: "flag" },
  ];
}

export function adminEventFilterWhere(p: FilterParams, now = new Date()): Prisma.EventWhereInput[] {
  const w = eventFilterWhere(p, now);
  if (one(p.noPoster) === "1") w.push({ OR: [{ posterUrl: null }, { posterUrl: "" }] });
  if (one(p.noCast) === "1") w.push({ performers: { none: {} } });
  return w;
}

export function adminLocationFilterDefs(): FilterDef[] {
  return [
    { key: "noCoords", title: "Без координат", kind: "flag" },
    { key: "noPhoto", title: "Без фото", kind: "flag" },
    {
      key: "whose",
      title: "Чьи",
      kind: "select",
      options: [
        { value: "catalog", label: "Каталожные" },
        { value: "user", label: "Пользовательские" },
      ],
    },
  ];
}

export function adminLocationFilterWhere(p: FilterParams): Prisma.LocationWhereInput[] {
  const w: Prisma.LocationWhereInput[] = [];
  if (one(p.noCoords) === "1") w.push({ latitude: null });
  if (one(p.noPhoto) === "1") w.push({ OR: [{ photoUrl: null }, { photoUrl: "" }] });
  const whose = one(p.whose);
  if (whose === "catalog") w.push({ createdByUserId: null });
  if (whose === "user") w.push({ createdByUserId: { not: null } });
  return w;
}

export function adminNovelFilterDefs(t: Dict, o: NovelFilterOptions): FilterDef[] {
  return [
    ...novelFilterDefs(t, o),
    { key: "noCover", title: "Без обложки", kind: "flag" },
  ];
}

export function adminNovelFilterWhere(p: FilterParams): Prisma.NovelWhereInput[] {
  const w = novelFilterWhere(p);
  if (one(p.noCover) === "1") w.push({ OR: [{ coverUrl: null }, { coverUrl: "" }] });
  return w;
}

export function adminAgencyFilterDefs(): FilterDef[] {
  return [
    { key: "noLogo", title: "Без логотипа", kind: "flag" },
    { key: "noDescription", title: "Без описания", kind: "flag" },
  ];
}

export function adminAgencyFilterWhere(p: FilterParams): Prisma.AgencyWhereInput[] {
  const w: Prisma.AgencyWhereInput[] = [];
  if (one(p.noLogo) === "1") w.push({ OR: [{ logoUrl: null }, { logoUrl: "" }] });
  if (one(p.noDescription) === "1") w.push({ OR: [{ description: null }, { description: "" }] });
  return w;
}

export function adminPairingFilterDefs(): FilterDef[] {
  return [
    {
      key: "pairingStatus",
      title: "Статус",
      kind: "select",
      options: [
        { value: "CURRENT", label: "Текущий" },
        { value: "PAST", label: "Бывший" },
      ],
    },
  ];
}

export function adminPairingFilterWhere(p: FilterParams): Prisma.PairingWhereInput[] {
  const w: Prisma.PairingWhereInput[] = [];
  const status = one(p.pairingStatus);
  if (status === "CURRENT" || status === "PAST") w.push({ status });
  return w;
}

export function adminUserFilterDefs(): FilterDef[] {
  return [
    {
      key: "role",
      title: "Права",
      kind: "select",
      options: [
        { value: "admin", label: "Админы" },
        { value: "manager", label: "Менеджеры" },
        { value: "user", label: "Обычные" },
      ],
    },
    {
      key: "premium",
      title: "Подписка",
      kind: "select",
      options: [
        { value: "active", label: "Активна" },
        // Бессрочная — отдельным вариантом (правка владельца
        // 2026-09-18): её выдают руками друзьям и команде, и «кому
        // выдана навсегда» — свой вопрос, а не срез активных.
        { value: "lifetime", label: "Бессрочная" },
        { value: "none", label: "Нет или истекла" },
      ],
    },
    {
      key: "userLocale",
      title: "Язык",
      kind: "select",
      options: [
        { value: "en", label: "Английский" },
        { value: "ru", label: "Русский" },
      ],
    },
    { key: "registered", title: "Регистрация", kind: "dateRange" },
    { key: "lastSeen", title: "Последний вход", kind: "dateRange" },
  ];
}

export function adminUserFilterWhere(p: FilterParams, now = new Date()): Prisma.UserWhereInput[] {
  const w: Prisma.UserWhereInput[] = [];
  const role = one(p.role);
  if (role === "admin") w.push({ isAdmin: true });
  if (role === "manager") w.push({ isManager: true, isAdmin: false });
  if (role === "user") w.push({ isAdmin: false, isManager: false });
  const premium = one(p.premium);
  if (premium === "active") w.push(premiumActiveWhere(now));
  if (premium === "lifetime") w.push({ premiumLifetime: true });
  if (premium === "none") w.push(premiumInactiveWhere(now));
  const loc = one(p.userLocale);
  if (loc === "en" || loc === "ru") w.push({ locale: loc });
  const regFrom = dateOrNull(p.registeredFrom);
  if (regFrom) w.push({ createdAt: { gte: regFrom } });
  const regTo = dateOrNull(p.registeredTo);
  if (regTo) w.push({ createdAt: { lt: new Date(regTo.getTime() + 24 * 60 * 60 * 1000) } });
  const seenFrom = dateOrNull(p.lastSeenFrom);
  if (seenFrom) w.push({ lastSeenAt: { gte: seenFrom } });
  const seenTo = dateOrNull(p.lastSeenTo);
  if (seenTo) w.push({ lastSeenAt: { lt: new Date(seenTo.getTime() + 24 * 60 * 60 * 1000) } });
  return w;
}
