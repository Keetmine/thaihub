import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import {
  fetchMediaWikiParsedHtml,
  headingByText,
  contentAfterHeading,
  parseTableGrid,
  textWithBreaks,
} from "@/lib/mediawikiParse";
import {
  DEFAULT_FANDOM_HOST,
  FANDOM_UA,
  fandomApiBase,
  fandomPageUrl,
  parseFandomTarget,
} from "@/lib/fandomWiki";

// Расширенный профиль артиста/группы со страницы tpop.fandom.com —
// всё, чего не берёт базовый fetchTpopMemberPage/fetchTpopBandPage:
// occupation/instruments/solo debut/рост/вес из инфобокса, клипы,
// награды, факты, источники и список концертов (для сверки с событиями).
// Чистые функции без БД, доступ — через api.php (см. tpopFandom.ts).

const UA = FANDOM_UA;

export type TpopAwardRow = {
  year: string;
  award: string;
  category: string;
  nominee: string;
  result: string;
};

export type TpopReference = { label: string; url: string | null };

export type TpopConcertEntry = {
  title: string;
  year: string | null;
  /** Ссылка на вики-страницу самого концерта (не артиста «(with …)»). */
  wikiHref: string | null;
};

export type TpopArtistExtras = {
  occupation: string[];
  instruments: string[];
  soloDebut: string | null;
  height: string | null;
  weight: string | null;
  mvAppearances: string[];
  trivia: string[];
  awards: TpopAwardRow[];
  references: TpopReference[];
  concerts: TpopConcertEntry[];
  sourceUrl: string;
};

/** Все элементы после заголовка секции до следующего заголовка того же
 *  (или более высокого) уровня h2 — в отличие от contentAfterHeading,
 *  который отдаёт только ПЕРВЫЙ элемент и потому не видит подсекции
 *  (у «Concerts» строки живут внутри h3 Tours/Solo/…). */
function sectionElements($: CheerioAPI, heading: Cheerio<AnyNode>): Cheerio<AnyNode>[] {
  const parent = heading.parent();
  const isWrapped =
    parent.length > 0 && parent.get(0)?.tagName === "div" && (parent.attr("class") ?? "").includes("mw-heading");
  let node = (isWrapped ? parent : heading).next();
  const out: Cheerio<AnyNode>[] = [];
  while (node.length) {
    const tag = node.get(0)?.tagName ?? "";
    const cls = node.attr("class") ?? "";
    if (tag === "h2" || (tag === "div" && cls.includes("mw-heading2"))) break;
    out.push(node);
    node = node.next();
  }
  return out;
}

function infoboxList($: CheerioAPI, infobox: Cheerio<AnyNode>, label: string): string[] {
  const item = infobox
    .find(".pi-item")
    .filter((_, el) => $(el).find(".pi-data-label").text().trim() === label)
    .first();
  if (!item.length) return [];
  return textWithBreaks($, item.find(".pi-data-value"))
    .split(/\n|,/) // поля бывают и <br>-, и запято-разделённые
    .map((s) => s.trim())
    .filter(Boolean);
}

function infoboxText($: CheerioAPI, infobox: Cheerio<AnyNode>, label: string): string | null {
  const item = infobox
    .find(".pi-item")
    .filter((_, el) => $(el).find(".pi-data-label").text().trim() === label)
    .first();
  if (!item.length) return null;
  const text = textWithBreaks($, item.find(".pi-data-value")).replace(/\n/g, ", ").trim();
  return text || null;
}

/** Все <li> секции (включая подсекции до следующего h2) текстом. */
function sectionListItems($: CheerioAPI, headingText: string): string[] {
  const heading = headingByText($, headingText);
  if (!heading.length) return [];
  const out: string[] = [];
  for (const el of sectionElements($, heading)) {
    el.find("li").each((__, li) => {
      const text = $(li).text().replace(/\[\d+\]/g, "").trim();
      if (text) out.push(text);
    });
  }
  return out;
}

/** Строки концертов из секций Concerts/Fanmeetings: текст пункта +
 *  вытащенный год (для сверки с нашей афишей). */
function parseConcerts($: CheerioAPI): TpopConcertEntry[] {
  const entries: TpopConcertEntry[] = [];
  for (const section of ["Concerts", "Fanmeetings", "Concerts and events"]) {
    const heading = headingByText($, section);
    if (!heading.length) continue;
    for (const el of sectionElements($, heading)) {
      el
        .find("li")
        .each((__, liEl) => {
          const li = $(liEl);
          const raw = li.text().replace(/\[\d+\]/g, "").trim();
          if (!raw) return;
          const year = raw.match(/\b(20\d{2})\b/)?.[1] ?? null;
          const title = raw
            .replace(/\(\s*20\d{2}[^)]*\)/g, "")
            .replace(/\(with[^)]*\)?/gi, "")
            .replace(/[\[\]]/g, "")
            .replace(/^\s*[-–—:]\s*/, "")
            .replace(/\s{2,}/g, " ")
            .trim();
          if (!title) return;
          // Ссылка на страницу концерта: текст ссылки должен совпадать с
          // названием (иначе это ссылка на артиста из «(with Gemini)»).
          let wikiHref: string | null = null;
          li.find('a[href^="/wiki/"]').each((___, a) => {
            if (wikiHref) return;
            const linkText = $(a).text().trim().toLowerCase();
            if (linkText && linkText === title.toLowerCase()) {
              wikiHref = $(a).attr("href") ?? null;
            }
          });
          entries.push({ title, year, wikiHref });
        });
    }
  }
  return entries;
}

function parseAwards($: CheerioAPI): TpopAwardRow[] {
  const heading = headingByText($, "Awards and nominations");
  if (!heading.length) return [];
  const rows: TpopAwardRow[] = [];
  for (const el of sectionElements($, heading)) {
    const tables = el.is("table") ? el : el.find("table");
    tables.each((__, tableEl) => {
      const grid = parseTableGrid($, $(tableEl));
      if (grid.length < 2) return;
      const header = grid[0].map((h) => h.toLowerCase());
      const col = (name: string) => header.findIndex((h) => h.includes(name));
      const yearI = col("year");
      // Колонка премии называется по-разному: «Award», «Event»,
      // «Ceremony» (у NuNew — Event, из-за чего «Премия» была пустой).
      const awardI = Math.max(col("award"), col("event"), col("ceremony"));
      const categoryI = col("categor");
      const nomineeI = Math.max(col("nominee"), col("nominated work"), col("recipient"));
      const resultI = col("result");
      for (const row of grid.slice(1)) {
        const cell = (i: number) => (i >= 0 && row[i] ? row[i].replace(/\[\d+\]/g, "").trim() : "");
        const award = cell(awardI);
        const result = cell(resultI);
        if (!award && !result) continue;
        rows.push({
          year: cell(yearI),
          award,
          category: cell(categoryI),
          nominee: cell(nomineeI),
          result,
        });
      }
    });
  }
  return rows;
}

/** Секция References: сноски с текстом и (если есть) ссылкой. */
function parseReferences($: CheerioAPI): TpopReference[] {
  const out: TpopReference[] = [];
  $(".references li, ol.references li").each((_, li) => {
    const item = $(li);
    // убираем «↑»/backlinks-стрелки
    item.find(".mw-cite-backlink").remove();
    const url = item.find("a.external").first().attr("href") ?? null;
    const label = item.text().replace(/\s+/g, " ").trim();
    if (label || url) out.push({ label: label || (url ?? ""), url });
  });
  return out;
}

export async function fetchTpopArtistExtras(
  pageTitleOrUrl: string,
  fallbackHost: string = DEFAULT_FANDOM_HOST,
): Promise<TpopArtistExtras> {
  const { host, title: pageTitle } = parseFandomTarget(pageTitleOrUrl, fallbackHost);
  const html = await fetchMediaWikiParsedHtml(fandomApiBase(host), pageTitle, UA);
  const $ = cheerio.load(html);
  const infobox = $(".portable-infobox").first();

  return {
    occupation: infoboxList($, infobox, "Occupation"),
    instruments: infoboxList($, infobox, "Instrument(s)").concat(
      infoboxList($, infobox, "Instruments"),
    ),
    soloDebut: infoboxText($, infobox, "Solo debut"),
    height: infoboxText($, infobox, "Height"),
    weight: infoboxText($, infobox, "Weight"),
    mvAppearances: sectionListItems($, "Music video appearances"),
    trivia: sectionListItems($, "Trivia"),
    awards: parseAwards($),
    references: parseReferences($),
    concerts: parseConcerts($),
    sourceUrl: fandomPageUrl(host, pageTitle),
  };
}

/** Внешние ссылки страницы песни/альбома (официальный API
 *  action=parse&prop=externallinks) — берём первую «площадочную». */
export async function fetchTpopPageStreamingLink(
  pageTitleOrUrl: string,
  fallbackHost: string = DEFAULT_FANDOM_HOST,
): Promise<string | null> {
  const { host, title: pageTitle } = parseFandomTarget(pageTitleOrUrl, fallbackHost);
  const url = `${fandomApiBase(host)}?action=parse&page=${encodeURIComponent(pageTitle)}&format=json&prop=externallinks`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = (await res.json()) as { parse?: { externallinks?: string[] } };
  const links = data.parse?.externallinks ?? [];
  const preferred = ["youtube.com", "youtu.be", "spotify.com", "music.apple.com"];
  for (const host of preferred) {
    const hit = links.find((l) => l.includes(host));
    if (hit) return hit.startsWith("http") ? hit : `https:${hit}`;
  }
  return null;
}

export type TpopAgencyPage = {
  name: string;
  photoUrl: string | null;
  /** Первые абзацы статьи (до первого заголовка) — для Agency.description. */
  description: string | null;
  groups: { name: string; href: string }[];
  duos: { name: string; href: string }[];
  soloists: { name: string; href: string }[];
  former: { name: string; href: string }[];
  references: TpopReference[];
  sourceUrl: string;
};

function sectionArtistLinks($: CheerioAPI, headingText: string): { name: string; href: string }[] {
  const heading = headingByText($, headingText);
  if (!heading.length) return [];
  const out: { name: string; href: string }[] = [];
  contentAfterHeading($, heading).each((_, el) => {
    // ссылки и в списках, и в галереях артистов
    $(el)
      .find('a[href^="/wiki/"]')
      .each((__, a) => {
        const href = $(a).attr("href") ?? "";
        const name = ($(a).attr("title") || $(a).text()).trim();
        if (!href || !name) return;
        if (/^\/wiki\/(File|Category|Special):/.test(href)) return;
        if (!out.some((o) => o.href === href)) out.push({ name, href });
      });
  });
  return out;
}

/** Страница агентства: название, лого, списки артистов по секциям. */
export async function fetchTpopAgencyPage(
  pageTitleOrUrl: string,
  fallbackHost: string = DEFAULT_FANDOM_HOST,
): Promise<TpopAgencyPage> {
  const { host, title: pageTitle } = parseFandomTarget(pageTitleOrUrl, fallbackHost);
  const html = await fetchMediaWikiParsedHtml(fandomApiBase(host), pageTitle, UA);
  const $ = cheerio.load(html);
  const infobox = $(".portable-infobox").first();
  const photoRaw = infobox.find(".pi-image img").first().attr("src") ?? null;
  const photo = photoRaw
    ? (photoRaw.startsWith("http") ? photoRaw : `https:${photoRaw}`).replace(/\/revision\/.*$/, "")
    : null;

  // Краткое описание: вводные абзацы до первого заголовка, а если их
  // нет (агентские страницы часто начинаются сразу с Background) —
  // первые абзацы секций Background/History.
  const introParas: string[] = [];
  $(".mw-parser-output").first().children().each((_, el) => {
    const tag = el.tagName ?? "";
    const cls = $(el).attr("class") ?? "";
    if (tag === "h2" || cls.includes("mw-heading")) return false;
    if (tag === "p") {
      const text = $(el).text().replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
      if (text) introParas.push(text);
    }
    return undefined;
  });
  if (introParas.length === 0) {
    for (const sec of ["Background", "History"]) {
      const heading = headingByText($, sec);
      if (!heading.length) continue;
      for (const el of sectionElements($, heading)) {
        const collect = (node: typeof el) => {
          const text = node.text().replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
          if (text) introParas.push(text);
        };
        if (el.is("p")) collect(el);
        else el.find("p").each((_, pEl) => collect($(pEl)));
        if (introParas.length >= 2) break;
      }
      if (introParas.length > 0) break;
    }
  }

  const groups = sectionArtistLinks($, "Groups");
  const duos = [...sectionArtistLinks($, "Duos"), ...sectionArtistLinks($, "Duo")];
  let soloists = sectionArtistLinks($, "Soloists");
  // У маленьких лейблов (Change Music) артисты лежат плоским списком
  // прямо в «Artists», без подсекций — тогда берём их оттуда (тип
  // группа/соло всё равно определяется по инфобоксу каждой страницы).
  if (groups.length + duos.length + soloists.length === 0) {
    soloists = sectionArtistLinks($, "Artists");
  }

  return {
    name: pageTitle,
    photoUrl: photo,
    description: introParas.join("\n\n") || null,
    groups,
    duos,
    soloists,
    former: sectionArtistLinks($, "Former artists"),
    references: parseReferences($),
    sourceUrl: fandomPageUrl(host, pageTitle),
  };
}

export type TpopConcertPage = {
  title: string;
  posterUrl: string | null;
  venue: string | null;
  artists: string[];
  /** ISO-даты "YYYY-MM-DD" (диапазоны развёрнуты по дням). */
  dates: string[];
};

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** «August 26-27, 2023», «August 31 - September 1, 2024», «May 4, 2025»
 *  (и несколько дат сразу) → список ISO-дат. Диапазоны разворачиваются,
 *  но не длиннее 14 дней (защита от мусорного парса). */
export function parseConcertDates(text: string): string[] {
  const out: string[] = [];
  let rest = text;

  // кросс-месячные диапазоны
  rest = rest.replace(
    /([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/g,
    (_, m1, d1, m2, d2, y) => {
      const from = new Date(Date.UTC(Number(y), (MONTHS[m1.toLowerCase()] ?? 1) - 1, Number(d1)));
      const to = new Date(Date.UTC(Number(y), (MONTHS[m2.toLowerCase()] ?? 1) - 1, Number(d2)));
      for (let d = new Date(from), i = 0; d <= to && i < 14; d.setUTCDate(d.getUTCDate() + 1), i++) {
        out.push(iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
      }
      return " ";
    },
  );
  // диапазон дней внутри месяца
  rest = rest.replace(/([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})/g, (_, m1, d1, d2, y) => {
    const month = MONTHS[m1.toLowerCase()];
    if (month) {
      for (let d = Number(d1), i = 0; d <= Number(d2) && i < 14; d++, i++) out.push(iso(Number(y), month, d));
    }
    return " ";
  });
  // одиночные даты
  rest.replace(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/g, (_, m1, d1, y) => {
    const month = MONTHS[m1.toLowerCase()];
    if (month) out.push(iso(Number(y), month, Number(d1)));
    return " ";
  });
  return [...new Set(out)].sort();
}

/** Вики-страница концерта: инфобокс name/image/artist/date/venue. */
export async function fetchTpopConcertPage(
  pageTitleOrUrl: string,
  fallbackHost: string = DEFAULT_FANDOM_HOST,
): Promise<TpopConcertPage> {
  const { host, title: pageTitle } = parseFandomTarget(pageTitleOrUrl, fallbackHost);
  const html = await fetchMediaWikiParsedHtml(fandomApiBase(host), pageTitle, UA);
  const $ = cheerio.load(html);
  const infobox = $(".portable-infobox").first();
  const photoRaw2 = infobox.find(".pi-image img").first().attr("src") ?? null;
  const photo = photoRaw2
    ? (photoRaw2.startsWith("http") ? photoRaw2 : `https:${photoRaw2}`).replace(/\/revision\/.*$/, "")
    : null;

  const artists = textWithBreaks($, infobox.find('[data-source="artist"] .pi-data-value').first())
    .split(/\n|,|&/)
    .map((a) => a.trim())
    .filter(Boolean);

  const dateText = textWithBreaks($, infobox.find('[data-source="date"] .pi-data-value').first());
  const venueText = textWithBreaks($, infobox.find('[data-source="venue"] .pi-data-value').first())
    .replace(/\n/g, ", ")
    .trim();
  const venue = venueText || null;

  return {
    title: infobox.find(".pi-title").first().text().trim() || pageTitle,
    posterUrl: photo,
    venue,
    artists,
    dates: parseConcertDates(dateText),
  };
}
