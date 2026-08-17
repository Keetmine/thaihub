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
import { parseTpopPageTitle } from "@/lib/tpopFandom";

// Расширенный профиль артиста/группы со страницы tpop.fandom.com —
// всё, чего не берёт базовый fetchTpopMemberPage/fetchTpopBandPage:
// occupation/instruments/solo debut/рост/вес из инфобокса, клипы,
// награды, факты, источники и список концертов (для сверки с событиями).
// Чистые функции без БД, доступ — через api.php (см. tpopFandom.ts).

const UA = "MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";
const API_BASE = "https://tpop.fandom.com/api.php";

export type TpopAwardRow = {
  year: string;
  award: string;
  category: string;
  nominee: string;
  result: string;
};

export type TpopReference = { label: string; url: string | null };

export type TpopConcertEntry = { title: string; year: string | null };

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
  contentAfterHeading($, heading).each((_, el) => {
    $(el)
      .find("li")
      .each((__, li) => {
        const text = $(li).text().replace(/\[\d+\]/g, "").trim();
        if (text) out.push(text);
      });
  });
  return out;
}

/** Строки концертов из секций Concerts/Fanmeetings: текст пункта +
 *  вытащенный год (для сверки с нашей афишей). */
function parseConcerts($: CheerioAPI): TpopConcertEntry[] {
  const entries: TpopConcertEntry[] = [];
  for (const section of ["Concerts", "Fanmeetings", "Concerts and events"]) {
    for (const raw of sectionListItems($, section)) {
      const year = raw.match(/\b(20\d{2})\b/)?.[1] ?? null;
      // «(2024) Title» / «Title (2024)» → чистое название
      const title = raw
        .replace(/\(\s*20\d{2}[^)]*\)/g, "")
        .replace(/^\s*[-–—:]\s*/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (title) entries.push({ title, year });
    }
  }
  return entries;
}

function parseAwards($: CheerioAPI): TpopAwardRow[] {
  const heading = headingByText($, "Awards and nominations");
  if (!heading.length) return [];
  const rows: TpopAwardRow[] = [];
  contentAfterHeading($, heading).each((_, el) => {
    const tables =
      $(el).is("table") ? $(el) : $(el).find("table");
    tables.each((__, tableEl) => {
      const grid = parseTableGrid($, $(tableEl));
      if (grid.length < 2) return;
      const header = grid[0].map((h) => h.toLowerCase());
      const col = (name: string) => header.findIndex((h) => h.includes(name));
      const yearI = col("year");
      const awardI = col("award");
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
  });
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

export async function fetchTpopArtistExtras(pageTitleOrUrl: string): Promise<TpopArtistExtras> {
  const pageTitle = parseTpopPageTitle(pageTitleOrUrl);
  const html = await fetchMediaWikiParsedHtml(API_BASE, pageTitle, UA);
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
    sourceUrl: `https://tpop.fandom.com/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`,
  };
}

/** Внешние ссылки страницы песни/альбома (официальный API
 *  action=parse&prop=externallinks) — берём первую «площадочную». */
export async function fetchTpopPageStreamingLink(pageTitleOrUrl: string): Promise<string | null> {
  const pageTitle = parseTpopPageTitle(pageTitleOrUrl);
  const url = `${API_BASE}?action=parse&page=${encodeURIComponent(pageTitle)}&format=json&prop=externallinks`;
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
export async function fetchTpopAgencyPage(pageTitleOrUrl: string): Promise<TpopAgencyPage> {
  const pageTitle = parseTpopPageTitle(pageTitleOrUrl);
  const html = await fetchMediaWikiParsedHtml(API_BASE, pageTitle, UA);
  const $ = cheerio.load(html);
  const infobox = $(".portable-infobox").first();
  const photo = infobox.find(".pi-image img").first().attr("src") ?? null;

  return {
    name: pageTitle,
    photoUrl: photo ? (photo.startsWith("http") ? photo : `https:${photo}`) : null,
    groups: sectionArtistLinks($, "Groups"),
    duos: sectionArtistLinks($, "Duos"),
    soloists: sectionArtistLinks($, "Soloists"),
    former: sectionArtistLinks($, "Former artists"),
    references: parseReferences($),
    sourceUrl: `https://tpop.fandom.com/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`,
  };
}
