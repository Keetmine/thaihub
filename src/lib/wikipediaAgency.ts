import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

// Scraper for an English Wikipedia talent-agency article (e.g.
// en.wikipedia.org/wiki/Domundi_TV). Wikipedia's content is CC BY-SA
// (reuse explicitly permitted) and its robots.txt has no AI/bot
// disallow — a real contrast with TMDB/IMDb (see tmdb-import.md), and
// there's an official API built for exactly this. Pure functions, no DB
// access, same split as every other importer in this project.

const UA = "ThaiHubImporter/1.0 (personal fan-tracker, contact via site)";

/** Extracts the page title from either a bare title or a full
 *  en.wikipedia.org/wiki/{Title} URL. */
export function parseWikipediaPageTitle(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/wiki\/([^?#]+)/);
  return decodeURIComponent(match ? match[1] : trimmed).replace(/_/g, " ");
}

async function fetchParsedHtml(pageTitle: string): Promise<string> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
    pageTitle,
  )}&prop=text&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wikipedia ${pageTitle} -> HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Wikipedia: ${data.error.info ?? data.error.code}`);
  return data.parse.text["*"];
}

function headingByText($: CheerioAPI, text: string): Cheerio<AnyNode> {
  return $("h2, h3, h4")
    .filter((_, el) => $(el).text().trim().toLowerCase() === text.toLowerCase())
    .first();
}

/** The element that visually follows a heading is its *wrapper* div's
 *  next sibling, not the heading tag's own — modern Wikipedia wraps
 *  every heading in a `<div class="mw-heading">`. */
function contentAfterHeading($: CheerioAPI, heading: Cheerio<AnyNode>): Cheerio<AnyNode> {
  return heading.parent().next();
}

/** Reconstructs a Wikipedia table's *visual* grid, expanding `rowspan`/
 *  `colspan` — these tables group same-year or same-network productions
 *  by leaving the year/network cell out of every row but the first,
 *  relying on rowspan to "carry it down". Reading `<td>`s by a fixed
 *  index per row (what a naive parser does) silently shifts every
 *  column left for those rows — hit for real: a "Network" cell rowspan-3
 *  meant the next two rows' own Notes text got read as their Title. */
function parseTableGrid($: CheerioAPI, table: Cheerio<AnyNode>): string[][] {
  const grid: string[][] = [];
  const pending = new Map<number, { text: string; remaining: number }>();

  for (const tr of table.find("tr").toArray()) {
    const row: string[] = [];
    const cells = $(tr).find("td, th").toArray();
    let cellIndex = 0;
    let col = 0;

    while (cellIndex < cells.length || pending.has(col)) {
      const carry = pending.get(col);
      if (carry) {
        row[col] = carry.text;
        if (carry.remaining <= 1) pending.delete(col);
        else pending.set(col, { text: carry.text, remaining: carry.remaining - 1 });
        col += 1;
        continue;
      }
      const $cell = $(cells[cellIndex]);
      const text = $cell.text().replace(/\s+/g, " ").trim();
      const colspan = Math.max(1, parseInt($cell.attr("colspan") || "1", 10));
      const rowspan = Math.max(1, parseInt($cell.attr("rowspan") || "1", 10));
      for (let c = 0; c < colspan; c++) {
        row[col] = text;
        if (rowspan > 1) pending.set(col, { text, remaining: rowspan - 1 });
        col += 1;
      }
      cellIndex += 1;
    }
    grid.push(row);
  }

  return grid;
}

function parseProductionsTable(
  $: CheerioAPI,
  table: Cheerio<AnyNode>,
): { year: number | null; title: string; network: string | null }[] {
  const grid = parseTableGrid($, table);
  if (grid.length === 0) return [];

  const headers = grid[0].map((h) => h.toLowerCase());
  const yearCol = headers.indexOf("year");
  const titleCol = headers.indexOf("title");
  const networkCol = headers.indexOf("network");
  if (titleCol === -1) return [];

  return grid
    .slice(1)
    .map((row) => {
      const title = (row[titleCol] ?? "").trim();
      const yearText = yearCol !== -1 ? (row[yearCol] ?? "").trim() : "";
      const network = networkCol !== -1 ? (row[networkCol] ?? "").trim() : "";
      return {
        year: /^\d{4}/.test(yearText) ? Number(yearText.slice(0, 4)) : null,
        title,
        network: network || null,
      };
    })
    .filter((row) => row.title);
}

/** Splits one "Full Name (Nickname)" artist-list entry — same format and
 *  same caveat as ThaiTicketMajor's artist lines (see
 *  parseArtistLine in thaiticketmajor.ts): this is the reliable form
 *  (nickname always parenthesized here, no ambiguous nickname-first
 *  case like TTM has), so no heuristic guessing needed. */
function parseAgencyArtistEntry(raw: string): { fullName: string; nickname: string } {
  const text = raw.replace(/\s+/g, " ").trim();
  const match = text.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) return { fullName: match[1].trim(), nickname: match[2].trim() };
  return { fullName: text, nickname: text };
}

function parseArtistList($: CheerioAPI, container: Cheerio<AnyNode>): { fullName: string; nickname: string }[] {
  return container
    .find("li")
    .map((_, el) => $(el).text())
    .get()
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map(parseAgencyArtistEntry);
}

export type WikipediaAgencyData = {
  name: string;
  description: string | null;
  logoUrl: string | null;
  productions: { year: number | null; title: string; network: string | null }[];
  upcoming: { title: string; notes: string | null }[];
  currentArtists: { fullName: string; nickname: string }[];
  formerArtists: { fullName: string; nickname: string }[];
};

export async function fetchWikipediaAgencyPage(pageTitleOrUrl: string): Promise<WikipediaAgencyData> {
  const pageTitle = parseWikipediaPageTitle(pageTitleOrUrl);
  const html = await fetchParsedHtml(pageTitle);
  const $ = cheerio.load(html);

  const infobox = $(".infobox").first();
  // The page title ("Domundi TV") rather than the infobox's full legal
  // name ("Domundi TV Co., Ltd.") — shorter and matches how the agency
  // is actually referred to everywhere else on the page and in the app.
  const name = pageTitle;
  const logoSrc = infobox.find("img").first().attr("src") ?? null;
  const logoUrl = logoSrc ? (logoSrc.startsWith("http") ? logoSrc : `https:${logoSrc}`) : null;

  // The lead/intro is the first non-empty <p> directly in the article
  // body — earlier ones are often empty spacer paragraphs before the
  // infobox content finishes wrapping.
  const description =
    $(".mw-parser-output > p")
      .toArray()
      .map((el) => $(el).text().trim())
      .find((t) => t.length > 0) ?? null;

  // "List of productions" can have multiple sub-tables (e.g. "Television
  // series" vs. "Television show") — only the scripted-drama one is
  // relevant here, a reality/variety-show table doesn't belong in the
  // Drama catalog any more than a TMDB "Self" credit does (see
  // tmdb-import.md's known-for filtering for the same reasoning).
  const seriesHeading = headingByText($, "Television series");
  const productions = seriesHeading.length
    ? parseProductionsTable($, contentAfterHeading($, seriesHeading))
    : [];

  const upcomingHeading = headingByText($, "Upcoming TV series");
  let upcoming: { title: string; notes: string | null }[] = [];
  if (upcomingHeading.length) {
    // The table isn't the heading's immediate next sibling here — an
    // intro paragraph usually sits in between.
    const candidates = upcomingHeading.parent().nextAll("table").first();
    const grid = parseTableGrid($, candidates);
    const headers = (grid[0] ?? []).map((h) => h.toLowerCase());
    const titleCol = headers.indexOf("title");
    const notesCol = headers.indexOf("notes");
    if (titleCol !== -1) {
      upcoming = grid
        .slice(1)
        .map((row) => {
          return {
            title: (row[titleCol] ?? "").trim(),
            notes: notesCol !== -1 ? (row[notesCol] ?? "").trim() || null : null,
          };
        })
        .filter((row) => row.title);
    }
  }

  // "Current" roster is usually split into dated sub-groups ("Generation
  // 1", "Generation 2", …) we don't track — every <li> under the
  // "Current" h3, regardless of which h4 it's nested under, still counts.
  const currentHeading = headingByText($, "Current");
  const currentArtists: { fullName: string; nickname: string }[] = [];
  if (currentHeading.length) {
    let node = currentHeading.parent().next();
    while (node.length && !(node.get(0)?.tagName === "div" && node.hasClass("mw-heading2"))) {
      if (node.hasClass("div-col") || node.get(0)?.tagName === "ul") {
        currentArtists.push(...parseArtistList($, node));
      }
      node = node.next();
    }
  }

  const formerHeading = headingByText($, "Former");
  const formerArtists = formerHeading.length
    ? parseArtistList($, contentAfterHeading($, formerHeading))
    : [];

  return { name, description, logoUrl, productions, upcoming, currentArtists, formerArtists };
}
