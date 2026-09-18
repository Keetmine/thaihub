import { prisma } from "@/lib/prisma";
import type { TtmArtist } from "@/lib/thaiticketmajor";

// Сопоставление спарсенного состава события с нашим каталогом.
// Вынесено из importActions.ts («событие по ссылке»), потому что тем же
// правилом пользуется краулер афиши (src/lib/ttmCrawl.ts): у решения
// «этот артист — наш» должна быть одна реализация, а не две копии,
// которые разъедутся.

/** Тёзка, между которыми матчинг не выбрал, — показываем владельцу. */
export type ArtistCandidate = {
  id: string;
  name: string;
  realName: string | null;
  birthYear: number | null;
  type: "SOLO" | "BAND";
};

/** Артист со страницы события + найденный (или нет) исполнитель. */
export type MatchedArtist = {
  fullName: string;
  nickname: string;
  matchedPerformerId: string | null;
  /** Как совпало: по нику/алиасу, по разведённому реальному имени,
   *  «тёзки» (не выбрали — привязки нет) или никого. */
  via: "by-name" | "by-real-name" | "ambiguous" | null;
  /** Только для `ambiguous`: между кем не выбрали. */
  candidates: ArtistCandidate[];
};

/** Сравнение имён: регистр, лишние пробелы и дефисы значения не имеют
 *  («Opas-iamkajorn» ↔ «Opasiamkajorn»), как в поиске дублей. */
function loose(s: string): string {
  return s.toLowerCase().replace(/[-\s.'’]/g, "");
}

/**
 * Матчит артистов события с каталогом.
 *
 * Правила (правка владельца 2026-09-10 — «у нас может быть 10 gun, и
 * парсер берёт рандомного»):
 *
 * 1. Кандидаты ищутся среди СОЛЬНЫХ И ГРУПП, по нику (`name`) и
 *    музыкальному алиасу — раньше группы в матчинге не участвовали
 *    осмысленно, и концерт группы заводил её копию в актёрах.
 * 2. Ровно один кандидат — привязка.
 * 3. Тёзки разводятся полным именем со страницы события
 *    (`fullName` ↔ `realName`): «Gun Atthaphan» найдёт своего Gun'а.
 * 4. Не развелись — привязки НЕТ, имя уходит в `ambiguous` вместе со
 *    списком тёзок: решает владелец в очереди черновиков. Раньше здесь
 *    строился Map по всем исполнителям сразу, и из десяти тёзок
 *    выигрывал случайный — тот, что оказался последним в выборке.
 *
 * Никакого фаззи-поиска: ложная привязка хуже пропуска — пропуск
 * добирается руками, ложную ещё надо заметить.
 */
export async function matchArtistsByNickname(artists: TtmArtist[]): Promise<MatchedArtist[]> {
  const nicknames = [...new Set(artists.map((a) => a.nickname.trim()).filter(Boolean))];
  if (nicknames.length === 0) {
    return artists.map((a) => ({ ...a, matchedPerformerId: null, via: null, candidates: [] }));
  }

  // Выбираем ТОЛЬКО по спарсенным именам, а не весь каталог: раньше
  // сюда приезжали все 17 тысяч исполнителей на каждое событие.
  const rows = await prisma.performer.findMany({
    where: {
      // Маскоты не выступают (то же правило, что у лайнапа фестиваля).
      type: { in: ["SOLO", "BAND"] },
      OR: [
        { name: { in: nicknames, mode: "insensitive" } },
        { musicAlias: { in: nicknames, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, realName: true, birthDate: true, musicAlias: true, type: true },
  });

  const byNickname = new Map<string, ArtistCandidate[]>();
  for (const r of rows) {
    const candidate: ArtistCandidate = {
      id: r.id,
      name: r.name,
      realName: r.realName,
      birthYear: r.birthDate?.getUTCFullYear() ?? null,
      type: r.type as "SOLO" | "BAND",
    };
    for (const n of [r.name, r.musicAlias]) {
      if (!n) continue;
      const key = n.toLowerCase().trim();
      const list = byNickname.get(key) ?? [];
      if (!list.some((c) => c.id === candidate.id)) list.push(candidate);
      byNickname.set(key, list);
    }
  }

  return artists.map((a) => {
    const nickname = a.nickname.trim();
    const found = byNickname.get(nickname.toLowerCase()) ?? [];
    if (found.length === 0) {
      return { ...a, matchedPerformerId: null, via: null, candidates: [] };
    }
    if (found.length === 1) {
      return { ...a, matchedPerformerId: found[0].id, via: "by-name" as const, candidates: [] };
    }

    // Тёзки: разводим полным именем со страницы. Сравниваем и с самим
    // реальным именем, и со склейкой «Ник Реальное Имя» — на билетных
    // сайтах пишут и так, и так.
    const fullName = a.fullName.trim();
    if (fullName) {
      const wanted = loose(fullName);
      const narrowed = found.filter(
        (c) =>
          (c.realName && loose(c.realName) === wanted) ||
          loose(`${c.name} ${c.realName ?? ""}`) === wanted,
      );
      if (narrowed.length === 1) {
        return {
          ...a,
          matchedPerformerId: narrowed[0].id,
          via: "by-real-name" as const,
          candidates: [],
        };
      }
    }

    return { ...a, matchedPerformerId: null, via: "ambiguous" as const, candidates: found };
  });
}

// ---------------------------------------------------------------------------
// Владельцы маскотов (краулер страницы Mascots gmmtv.fandom.com, см.
// src/lib/gmmtvMascots.ts). Отдельная функция, а не matchArtistsByNickname:
// владельцем бывает и группа (BAND по name — правка владельца 2026-09-05,
// см. searchMascotOwnerOptions в performers/actions.ts), а у сольников ник
// в каталоге НЕ уникален («New», «Earth», «Win» — по 4–7 тёзок), и правило
// «последний в Map выигрывает» тут привязало бы маскота к чужому человеку.

/** Имя владельца с вики + подсказки для матчинга. */
export type MascotOwnerCandidate = {
  /** Ник как в тексте («Tay», «LYKN», «JASP.ER»). */
  name: string;
  /** Заголовок вики-страницы владельца («Tay Tawan Vihokratana») —
   *  ник + настоящее имя; по нему разводим тёзок. Null — ссылки не было. */
  wikiTitle?: string | null;
  /** Из формулировки описания: пара/актёр → SOLO, группа → BAND. */
  kindHint?: "pair" | "group" | "solo" | null;
};

/** Совпавший владелец — то, что уезжает в MascotDraft.matchedOwners. */
export type MatchedMascotOwner = { performerId: string; name: string; type: "SOLO" | "BAND" };

/**
 * Матчит владельцев маскота с каталогом: точное case-insensitive
 * совпадение по name/realName/musicAlias у SOLO и по name у BAND.
 * Несколько тёзок разводятся настоящим именем из заголовка вики-страницы
 * («New Thitipoom Techa-apaikhun» → realName «Thitipoom Techa-apaikhun»);
 * не развелись — имя честно уходит в несовпавшие: ложная привязка хуже
 * пропуска (та же доктрина, что у matchArtistsByNickname выше).
 */
export async function matchMascotOwners(
  owners: MascotOwnerCandidate[],
): Promise<{ matched: MatchedMascotOwner[]; unmatched: string[] }> {
  const matched: MatchedMascotOwner[] = [];
  const unmatched: string[] = [];

  for (const owner of owners) {
    const name = owner.name.trim();
    if (!name) continue;

    let candidates = await prisma.performer.findMany({
      where: {
        type: { in: ["SOLO", "BAND"] },
        OR: [
          { name: { equals: name, mode: "insensitive" } },
          { realName: { equals: name, mode: "insensitive" } },
          { musicAlias: { equals: name, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, realName: true, type: true },
    });

    // Подсказка из формулировки: «boy group X» не должен совпасть с
    // сольником-тёзкой и наоборот.
    if (owner.kindHint === "group") candidates = candidates.filter((c) => c.type === "BAND");
    else if (owner.kindHint) candidates = candidates.filter((c) => c.type === "SOLO");

    if (candidates.length > 1 && owner.wikiTitle) {
      // «Tay Tawan Vihokratana» → хвост после ника — настоящее имя.
      const title = owner.wikiTitle.trim();
      const tail = title.toLowerCase().startsWith(name.toLowerCase())
        ? title.slice(name.length).trim()
        : null;
      const narrowed = candidates.filter(
        (c) =>
          (tail && c.realName?.toLowerCase() === tail.toLowerCase()) ||
          `${c.name} ${c.realName ?? ""}`.trim().toLowerCase() === title.toLowerCase(),
      );
      if (narrowed.length === 1) candidates = narrowed;
    }

    if (candidates.length === 1) {
      const c = candidates[0];
      if (!matched.some((m) => m.performerId === c.id)) {
        matched.push({ performerId: c.id, name: c.name, type: c.type as "SOLO" | "BAND" });
      }
    } else {
      unmatched.push(name);
    }
  }

  return { matched, unmatched };
}

// ---------------------------------------------------------------------------
// Лайнап фестиваля (краулер musicfestival.in.th, см. src/lib/musicFestivalCrawl.ts
// и docs/features/musicfestival-import.md). Своя функция, а не
// matchArtistsByNickname: у артиста с сайта есть постоянный адрес страницы
// (Performer.musicFestivalUrl) — по нему уже заведённые нами заготовки
// находятся без всякого сравнения имён, — а по имени, как и у маскотов,
// тёзки не разводятся: «New» в каталоге не один, и привязать фестиваль к
// чужому человеку хуже, чем завести ещё одну заготовку (её видно в списке
// заготовок и можно слить инструментом дублей).

/** Артист лайнапа: имя и канонический адрес его страницы на сайте. */
export type FestivalArtistCandidate = { name: string; url: string };

export type MatchedFestivalArtist = FestivalArtistCandidate & {
  /** Найденный исполнитель; null — совпадений нет (или тёзки). */
  performerId: string | null;
  /** «by-url» — по сохранённому адресу источника, «by-name» — по имени,
   *  «ambiguous» — по имени нашлось несколько (не привязан), null — никого. */
  via: "by-url" | "by-name" | "ambiguous" | null;
};

/**
 * Матчит артистов фестиваля с каталогом:
 *  1. по `Performer.musicFestivalUrl` — точное совпадение адреса
 *     (заготовки прошлых прогонов и записи, где владелец поставил ссылку);
 *  2. по имени — точное case-insensitive совпадение с `name` или
 *     `musicAlias` у SOLO/BAND (маскоты не выступают). Ровно один
 *     кандидат — привязка; несколько — `ambiguous`, привязки нет.
 * Никакого фаззи: ложная привязка хуже пропуска (как везде в матчинге).
 */
export async function matchFestivalArtists(
  artists: FestivalArtistCandidate[],
): Promise<MatchedFestivalArtist[]> {
  if (artists.length === 0) return [];
  const urls = [...new Set(artists.map((a) => a.url))];
  const names = [...new Set(artists.map((a) => a.name.trim()).filter(Boolean))];

  const [byUrlRows, byNameRows] = await Promise.all([
    prisma.performer.findMany({
      where: { musicFestivalUrl: { in: urls } },
      select: { id: true, musicFestivalUrl: true },
    }),
    prisma.performer.findMany({
      where: {
        type: { in: ["SOLO", "BAND"] },
        OR: [
          { name: { in: names, mode: "insensitive" } },
          { musicAlias: { in: names, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, musicAlias: true },
    }),
  ]);

  const byUrl = new Map(byUrlRows.map((p) => [p.musicFestivalUrl!, p.id]));
  const key = (s: string) => s.toLowerCase().trim();
  const byName = new Map<string, Set<string>>();
  for (const p of byNameRows) {
    for (const n of [p.name, p.musicAlias]) {
      if (!n) continue;
      const k = key(n);
      if (!byName.has(k)) byName.set(k, new Set());
      byName.get(k)!.add(p.id);
    }
  }

  return artists.map((a) => {
    const viaUrl = byUrl.get(a.url);
    if (viaUrl) return { ...a, performerId: viaUrl, via: "by-url" };
    const ids = byName.get(key(a.name));
    if (!ids || ids.size === 0) return { ...a, performerId: null, via: null };
    if (ids.size > 1) return { ...a, performerId: null, via: "ambiguous" };
    return { ...a, performerId: [...ids][0], via: "by-name" };
  });
}

// ---------------------------------------------------------------------------
// Теги thaistarx.com (краулер src/lib/thaiStarXCrawl.ts, см.
// docs/features/thaistarx-crawl.md). У поста о событии в CSS-классах
// `<article>` лежат теги — слаги артистов, пейрингов и агентств:
// `forcebook`, `namtan-tipnaree`, `lykn`, `jasp-er`, `gmmtv`. Состав
// события в прозе поста ненадёжен («Presented by … Force Jiratchapong
// Srisang and Book …»), а теги проставляет редакция — по ним и матчим.
//
// Отдельно от matchArtistsByNickname: там на входе «ник + полное имя» со
// строки билетного сайта, здесь — слаг, который бывает пейрингом
// («milklove» = Milk + Love), и сравнивать надо без дефисов и регистра.
// Правила те же по духу: одно точное совпадение — привязка, тёзки —
// вопрос владельцу, никакого фаззи.

export type TagCatalog = {
  performers: { id: string; name: string; realName: string | null; musicAlias: string | null; birthYear: number | null; type: "SOLO" | "BAND" }[];
  pairings: { performerAId: string; performerBId: string; nameA: string; nameB: string }[];
};

export type TagMatchResult = {
  /** Привязанные исполнители: performerId + ник, как в EventDraft.matchedPerformers. */
  matched: { performerId: string; nickname: string }[];
  /** Теги, у которых несколько кандидатов и полное имя не развело. */
  ambiguous: { nickname: string; fullName: string; candidates: ArtistCandidate[] }[];
  /** Теги, которые ни на кого не похожи (агентства, даты турне и т.п.). */
  unmatched: string[];
};

/** Каталог для матчинга тегов — один раз на прогон, не на каждое
 *  событие: сравнение без дефисов в SQL не выразить, а исполнителей
 *  десять тысяч. */
export async function loadTagCatalog(): Promise<TagCatalog> {
  const [performers, pairings] = await Promise.all([
    prisma.performer.findMany({
      where: { type: { in: ["SOLO", "BAND"] } },
      select: { id: true, name: true, realName: true, musicAlias: true, birthDate: true, type: true },
    }),
    prisma.pairing.findMany({
      select: {
        performerAId: true,
        performerBId: true,
        performerA: { select: { name: true } },
        performerB: { select: { name: true } },
      },
    }),
  ]);
  return {
    performers: performers.map((p) => ({
      id: p.id,
      name: p.name,
      realName: p.realName,
      musicAlias: p.musicAlias,
      birthYear: p.birthDate?.getUTCFullYear() ?? null,
      type: p.type as "SOLO" | "BAND",
    })),
    pairings: pairings.map((p) => ({
      performerAId: p.performerAId,
      performerBId: p.performerBId,
      nameA: p.performerA.name,
      nameB: p.performerB.name,
    })),
  };
}

/**
 * Чистый матчинг тегов по каталогу (тестируется без БД).
 *
 * Для каждого тега (даты «20260404» отбрасываются заранее):
 * 1. **Пейринг**: слаг равен склейке ников участников в любом порядке
 *    («williamest» = William + Est) — привязываются оба.
 * 2. **Исполнитель целиком**: слаг равен нику или музыкальному алиасу
 *    без дефисов/точек/регистра («jasp-er» = JASP.ER, «lykn» = LYKN).
 * 2б. **Склейка двух ников** без пейринга в каталоге («milklove» = Milk +
 *    Love, «lingorm» = Ling + Orm): слаг режется на две части, каждая —
 *    ровно один исполнитель по нику (обе части не короче трёх знаков).
 *    Сухой прогон 2026-09-18 показал, что почти все «без совпадений» —
 *    именно такие GL-пары: актрисы в каталоге есть, пейринга нет. Правило
 *    идёт после «целиком», поэтому «namtan» не режется на Nam + Tan.
 * 3. **«ник-имя»**: слаг вида «namtan-tipnaree» — первая часть ник,
 *    остальное подсказка к реальному имени. Кандидаты по нику; несколько
 *    — разводим по началу реального имени («tipnaree» ↔ «Tipnaree
 *    Weerasakchai»). Ровно один — привязка, иначе тёзки.
 * Ни одно правило не сработало — тег в unmatched (так уходят агентства:
 * «gmmtv», «ch3-thailand» — они и не должны совпадать).
 */
export function matchTagsAgainstCatalog(tags: string[], catalog: TagCatalog): TagMatchResult {
  const norm = (s: string) => s.toLowerCase().replace(/[-\s.'’_]/g, "");
  const byLoose = new Map<string, TagCatalog["performers"]>();
  for (const p of catalog.performers) {
    for (const n of [p.name, p.musicAlias]) {
      if (!n) continue;
      const key = norm(n);
      if (!key) continue;
      const list = byLoose.get(key) ?? [];
      if (!list.some((c) => c.id === p.id)) list.push(p);
      byLoose.set(key, list);
    }
  }
  const pairingByKey = new Map<string, TagCatalog["pairings"][number]>();
  for (const pr of catalog.pairings) {
    pairingByKey.set(norm(pr.nameA + pr.nameB), pr);
    pairingByKey.set(norm(pr.nameB + pr.nameA), pr);
  }
  const byId = new Map(catalog.performers.map((p) => [p.id, p]));
  const toCandidate = (p: TagCatalog["performers"][number]): ArtistCandidate => ({
    id: p.id,
    name: p.name,
    realName: p.realName,
    birthYear: p.birthYear,
    type: p.type,
  });

  const matched: TagMatchResult["matched"] = [];
  const ambiguous: TagMatchResult["ambiguous"] = [];
  const unmatched: string[] = [];
  const add = (performerId: string, nickname: string) => {
    if (!matched.some((m) => m.performerId === performerId)) matched.push({ performerId, nickname });
  };

  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (!tag || /^\d{8}$/.test(tag)) continue;
    const key = norm(tag);

    // 1. Пейринг — оба участника.
    const pairing = pairingByKey.get(key);
    if (pairing) {
      add(pairing.performerAId, byId.get(pairing.performerAId)?.name ?? pairing.nameA);
      add(pairing.performerBId, byId.get(pairing.performerBId)?.name ?? pairing.nameB);
      continue;
    }

    // 2. Ник/алиас целиком.
    const whole = byLoose.get(key) ?? [];
    if (whole.length === 1) {
      add(whole[0].id, whole[0].name);
      continue;
    }

    // 2б. Склейка двух ников без пейринга в каталоге. Только когда тег
    // не содержит дефиса (иначе это «ник-имя», правило 3) и целиком ни
    // на кого не похож.
    if (whole.length === 0 && !tag.includes("-") && key.length >= 6) {
      let split: [TagCatalog["performers"][number], TagCatalog["performers"][number]] | null = null;
      let splits = 0;
      for (let i = 3; i <= key.length - 3; i++) {
        const a = byLoose.get(key.slice(0, i)) ?? [];
        const b = byLoose.get(key.slice(i)) ?? [];
        if (a.length === 1 && b.length === 1 && a[0].id !== b[0].id) {
          splits++;
          split = [a[0], b[0]];
        }
      }
      // Ровно одно разбиение — иначе неясно, где граница.
      if (split && splits === 1) {
        add(split[0].id, split[0].name);
        add(split[1].id, split[1].name);
        continue;
      }
    }

    // 3. «ник-имя».
    const dash = tag.indexOf("-");
    if (dash > 0) {
      const nick = tag.slice(0, dash);
      const hint = norm(tag.slice(dash + 1));
      const found = byLoose.get(norm(nick)) ?? [];
      if (found.length === 1) {
        add(found[0].id, found[0].name);
        continue;
      }
      if (found.length > 1) {
        const narrowed = found.filter((c) => c.realName && norm(c.realName).startsWith(hint));
        if (narrowed.length === 1) {
          add(narrowed[0].id, narrowed[0].name);
          continue;
        }
        ambiguous.push({ nickname: nick, fullName: tag.slice(dash + 1).replace(/-/g, " "), candidates: found.map(toCandidate) });
        continue;
      }
    }

    if (whole.length > 1) {
      ambiguous.push({ nickname: tag, fullName: "", candidates: whole.map(toCandidate) });
      continue;
    }
    unmatched.push(tag);
  }
  return { matched, ambiguous, unmatched };
}

// ---------------------------------------------------------------------------
// Артисты каталога в СВОБОДНОМ ТЕКСТЕ события — для билетных сайтов без
// размеченного состава (Ticketmelon, AllTicket: краулеры
// src/lib/ticketSiteCrawl.ts). Там имена живут в названии и описании:
// «BOY SOMPOB WORLD Y TOUR», «Joining the lineup: … Phum Viphurit»,
// «KristSingto Fan Meeting». Правила от сильного к слабому; одиночный
// ник — самое слабое и потому с оговорками: «Off», «Gun», «New», «Win»,
// «Earth», «Film» — обычные английские слова, по ним в тексте нельзя.

/** Ники-слова, которые нельзя искать поодиночке: они встречаются в
 *  любом английском тексте и без фамилии ничего не значат. Не полный
 *  словарь — только то, что реально есть в каталоге и бьёт по тексту.
 *  Короче пяти знаков и так не ищется (см. правило 5). */
const TEXT_MATCH_STOPWORDS = new Set([
  // Сухой прогон Ticketmelon 2026-09-18 поймал именно эти: «Touch»,
  // «Build», «Chance», «Fresh», «Friend», «Alpha», «Sydney», «Rooftop»,
  // «Artist» — всё ники из каталога и всё обычные слова афиши.
  "touch", "build", "chance", "fresh", "friend", "alpha", "sydney", "rooftop", "artist", "artists",
  "membership", "member", "family", "brother", "sister", "mother", "father", "baby", "honey",
  "lucky", "magic", "super", "ultra", "mega", "grand", "royal", "crown", "empire", "legend",
  "hero", "heroes", "storm", "thunder", "flash", "spark", "fire", "water", "stone", "river",
  "mountain", "island", "garden", "forest", "flower", "lotus", "rose", "jasmine", "orchid",
  "nature", "planet", "galaxy", "cosmos", "space", "rocket", "engine", "motor", "racing",
  "junction", "station", "avenue", "street", "bridge", "tower", "palace", "castle", "temple",
  "market", "bazaar", "studio", "gallery", "theatre", "theater", "cinema", "arena", "stadium",
  "camping", "picnic", "dinner", "brunch", "coffee", "sunset", "sunrise", "midnight", "morning",
  "monday", "friday", "sunday", "august", "october", "december", "january", "february",
  "first", "fourth", "force", "earth", "great", "smile", "bright", "ocean", "dream", "night",
  "sunny", "title", "model", "plane", "story", "heart", "happy", "money", "music", "peach",
  "apple", "cherry", "candy", "honey", "sugar", "angel", "queen", "prince", "tiger", "cream",
  "seven", "eight", "three", "world", "party", "final", "stage", "sound", "light", "front",
  "point", "power", "focus", "frame", "green", "white", "black", "brown", "silver", "golden",
  "pearl", "north", "south", "summer", "winter", "spring", "nurse", "doctor", "captain",
  "junior", "senior", "master", "mister", "chief", "major", "minor", "singer", "dancer",
  "guitar", "piano", "drums", "ticket", "event", "concert", "festival", "special", "premium",
]);

const TEXT_MATCH_MIN_NICK = 5;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Слово/фраза целиком, без учёта регистра; границы — не буквы и не
 *  цифры (тайские буквы тоже граница: «Krist» внутри «บัตรKrist» найдётся). */
function phraseRe(phrase: string): RegExp {
  const inner = escapeRe(phrase.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^A-Za-z0-9])${inner}(?=$|[^A-Za-z0-9])`, "i");
}

/**
 * Ищет артистов каталога в тексте (название + описание события).
 *
 * 1. **Реальное имя** из двух и более слов как фраза («Perawat Sangpotirat»).
 * 2. **Ник + первое слово реального имени** («Krist Perawat», «Off Jumpol»).
 * 3. **Склейка ников пейринга** как слово («KristSingto», «OffGun»).
 * 4. **Группа** (`type: BAND`) по названию/алиасу целиком, от четырёх знаков
 *    («LYKN», «PERSES», «BOSS.CKM»).
 * 5. **Одиночный ник** — только от пяти знаков, единственный в каталоге и
 *    не из стоп-слов («Singto», «Nanon», «Phuwin»); тёзки по одному нику
 *    не ищутся вовсе — в тексте развести их нечем.
 *
 * Чистая функция, каталог тот же, что у тегов ThaiStarX (`loadTagCatalog`).
 */
export function matchCatalogInText(text: string, catalog: TagCatalog): TagMatchResult {
  const hay = text.replace(/\s+/g, " ");
  const matched: TagMatchResult["matched"] = [];
  const add = (performerId: string, nickname: string) => {
    if (!matched.some((m) => m.performerId === performerId)) matched.push({ performerId, nickname });
  };
  const loose = (s: string) => s.toLowerCase().replace(/[-\s.'’_]/g, "");
  const byLoose = new Map<string, number>();
  for (const p of catalog.performers) {
    for (const n of [p.name, p.musicAlias]) {
      if (!n) continue;
      byLoose.set(loose(n), (byLoose.get(loose(n)) ?? 0) + 1);
    }
  }

  // 3. Пейринги — раньше сольных: «KristSingto» даёт обоих сразу. И
  // через пробел («Tay New», «Sea Keen»): два коротких ника рядом в
  // таком порядке — это пейринг, хотя каждый поодиночке не ищется.
  const byId = new Map(catalog.performers.map((p) => [p.id, p]));
  for (const pr of catalog.pairings) {
    for (const phrase of [pr.nameA + pr.nameB, pr.nameB + pr.nameA, `${pr.nameA} ${pr.nameB}`, `${pr.nameB} ${pr.nameA}`]) {
      if (phrase.replace(/\s/g, "").length < 6) continue;
      if (phraseRe(phrase).test(hay)) {
        add(pr.performerAId, byId.get(pr.performerAId)?.name ?? pr.nameA);
        add(pr.performerBId, byId.get(pr.performerBId)?.name ?? pr.nameB);
        break;
      }
    }
  }

  for (const p of catalog.performers) {
    if (matched.some((m) => m.performerId === p.id)) continue;
    const real = (p.realName ?? "").trim();
    const realWords = real.split(/\s+/).filter(Boolean);
    // 1. Реальное имя целиком.
    if (realWords.length >= 2 && real.length >= 8 && phraseRe(real).test(hay)) {
      add(p.id, p.name);
      continue;
    }
    // 2. Ник + первое слово реального имени.
    if (realWords.length >= 1 && realWords[0].length >= 3 && p.name.trim().length >= 2) {
      if (phraseRe(`${p.name.trim()} ${realWords[0]}`).test(hay)) {
        add(p.id, p.name);
        continue;
      }
    }
    // 4. Группа целиком.
    if (p.type === "BAND") {
      for (const n of [p.name, p.musicAlias]) {
        if (!n || n.trim().length < 4 || TEXT_MATCH_STOPWORDS.has(n.trim().toLowerCase())) continue;
        if (byLoose.get(loose(n)) === 1 && phraseRe(n).test(hay)) {
          add(p.id, p.name);
          break;
        }
      }
      continue;
    }
    // 5. Одиночный ник — с оговорками.
    for (const n of [p.name, p.musicAlias]) {
      if (!n) continue;
      const nick = n.trim();
      if (nick.length < TEXT_MATCH_MIN_NICK) continue;
      if (TEXT_MATCH_STOPWORDS.has(nick.toLowerCase())) continue;
      if (byLoose.get(loose(nick)) !== 1) continue;
      if (phraseRe(nick).test(hay)) {
        add(p.id, p.name);
        break;
      }
    }
  }
  return { matched, ambiguous: [], unmatched: [] };
}
