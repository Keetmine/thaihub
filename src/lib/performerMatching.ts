import { prisma } from "@/lib/prisma";
import type { TtmArtist } from "@/lib/thaiticketmajor";

// Сопоставление спарсенного состава события с нашим каталогом.
// Вынесено из importActions.ts («событие по ссылке»), потому что тем же
// правилом пользуется краулер афиши (src/lib/ttmCrawl.ts): у решения
// «этот артист — наш» должна быть одна реализация, а не две копии,
// которые разъедутся.

/** Артист со страницы события + найденный (или нет) исполнитель. */
export type MatchedArtist = {
  fullName: string;
  nickname: string;
  matchedPerformerId: string | null;
};

/**
 * Матчит артистов по нику: точное совпадение без учёта регистра с
 * `Performer.name` (name — это и есть поле-ник, см.
 * docs/features/catalog.md). Никакого фаззи-поиска намеренно: ложная
 * привязка хуже пропуска — пропуск добирается руками, ложную ещё надо
 * заметить.
 */
export async function matchArtistsByNickname(artists: TtmArtist[]): Promise<MatchedArtist[]> {
  const existingPerformers = await prisma.performer.findMany({
    select: { id: true, name: true },
  });
  const byNickname = new Map(existingPerformers.map((p) => [p.name.toLowerCase().trim(), p.id]));

  return artists.map((a) => ({
    fullName: a.fullName,
    nickname: a.nickname,
    matchedPerformerId: byNickname.get(a.nickname.toLowerCase().trim()) ?? null,
  }));
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
