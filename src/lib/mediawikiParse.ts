import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

// Shared parsing helpers for MediaWiki-rendered article HTML
// (action=parse output) — used by both the Wikipedia agency importer
// (wikipediaAgency.ts) and the tpop.fandom.com band importer
// (tpopFandom.ts). Wikipedia and Fandom both run MediaWiki and share the
// same rendering quirks: heading-wrapper divs, rowspan/colspan tables,
// and <br>-stacked multi-value cells/fields.

/** Fetches an article's rendered HTML via the `action=parse` API — the
 *  official, intended way to pull page content programmatically (as
 *  opposed to scraping the rendered page), same approach for any
 *  MediaWiki-based site. `apiBaseUrl` is e.g.
 *  `https://en.wikipedia.org/w/api.php` or
 *  `https://tpop.fandom.com/api.php`. */
export async function fetchMediaWikiParsedHtml(
  apiBaseUrl: string,
  pageTitle: string,
  userAgent: string,
): Promise<string> {
  const url = `${apiBaseUrl}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!res.ok) throw new Error(`${apiBaseUrl} ${pageTitle} -> HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`${apiBaseUrl}: ${data.error.info ?? data.error.code}`);
  return data.parse.text["*"];
}

export function headingByText($: CheerioAPI, text: string): Cheerio<AnyNode> {
  return $("h2, h3, h4")
    .filter((_, el) => {
      // action=parse output (Wikipedia, tpop.fandom.com) doesn't include
      // the interactive "[edit]" section-link span, but a live rendered
      // page (drama.fandom.com, fetched via a real browser — see
      // dramaFandomAgency.ts) does, and its literal "[" "]" bracket text
      // would otherwise break an exact match ("Detalles[]" != "Detalles").
      const clone = $(el).clone();
      clone.find(".mw-editsection").remove();
      return clone.text().trim().toLowerCase() === text.toLowerCase();
    })
    .first();
}

/** The element that visually follows a heading is its *wrapper* div's
 *  next sibling, not the heading tag's own — modern Wikipedia/Fandom
 *  wrap every heading in a `<div class="mw-heading">`. Older MediaWiki
 *  installs (e.g. drama.fandom.com, still on a pre-"heading wrapper div"
 *  skin as of this writing) render a flat `<h2><span class="mw-headline">`
 *  with no wrapper at all, so the content is the heading tag's own next
 *  sibling instead — this checks which shape applies rather than
 *  assuming the newer one. Some pages (hit for real on GMMTV's "Former"
 *  section) also insert a stray non-content element — an empty `<link>`,
 *  `<style>`, etc. — right after that before the actual content, so this
 *  skips forward past those either way instead of blindly trusting the
 *  first sibling. */
export function contentAfterHeading($: CheerioAPI, heading: Cheerio<AnyNode>): Cheerio<AnyNode> {
  const parent = heading.parent();
  const usesWrapperDiv =
    parent.length > 0 && parent.get(0)?.tagName === "div" && (parent.attr("class") ?? "").includes("mw-heading");
  let node = usesWrapperDiv ? parent.next() : heading.next();
  while (node.length && ["link", "style", "meta"].includes(node.get(0)?.tagName ?? "")) {
    node = node.next();
  }
  return node;
}

/** Extracts an element's text, inserting ", " wherever `<br>` stacks
 *  multiple values in the same cell/infobox field — `.text()` alone
 *  would run them together with no space at all ("One HDBang Channel",
 *  or an agency's name running straight into its predecessor's). Works
 *  on a clone so it never mutates the live tree a caller might read
 *  again. */
export function textWithBreaks($: CheerioAPI, el: Cheerio<AnyNode>): string {
  const clone = el.clone();
  clone.find("br").replaceWith(", ");
  return clone.text().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

/** Splits one "Full Name (Nickname)" artist-list entry — same format and
 *  same caveat as ThaiTicketMajor's artist lines (see
 *  parseArtistLine in thaiticketmajor.ts): this is the reliable form
 *  (nickname always parenthesized here, no ambiguous nickname-first
 *  case like TTM has), so no heuristic guessing needed. Shared by every
 *  MediaWiki-flavor agency importer (Wikipedia, drama.fandom.com) that
 *  lists artists this way. */
export function parseNameNickname(raw: string): { fullName: string; nickname: string } {
  const text = raw.replace(/\s+/g, " ").trim();
  const match = text.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) return { fullName: match[1].trim(), nickname: match[2].trim() };
  return { fullName: text, nickname: text };
}

export function parseNameNicknameList(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
): { fullName: string; nickname: string }[] {
  return container
    .find("li")
    .map((_, el) => $(el).text())
    .get()
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map(parseNameNickname);
}

/** Parses one `<li>`-list production entry — "Title (Network, Year)",
 *  "Title (Year)", "Title (YearStart–YearEnd)", or "Title (TBA)". The
 *  common shape for a page that lists productions as a plain bullet
 *  list rather than a wikitable (e.g. drama.fandom.com's agency pages,
 *  or a Wikipedia article whose "Television dramas" section is a list
 *  instead of a table — Change2561's is, unlike Domundi TV/GMMTV's).
 *  Takes the *last* year found in a range (a show still airing/recently
 *  ended) and treats "(TBA)"/no digits as no year at all rather than
 *  guessing one. */
export function parseProductionListEntry(text: string): {
  title: string;
  network: string | null;
  year: number | null;
} {
  const match = text.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
  if (!match) return { title: text.trim(), network: null, year: null };

  const title = match[1].trim();
  const paren = match[2].trim();
  if (!paren || /^tba$/i.test(paren)) return { title, network: null, year: null };

  const parts = paren.split(",").map((p) => p.trim()).filter(Boolean);
  let year: number | null = null;
  const networkParts: string[] = [];
  for (const part of parts) {
    // A bare year or year-range token ("2019", "2023-2025", "2023–2025")
    // — anything that's purely digits/dashes/whitespace — takes the
    // *last* 4-digit run; anything else (a channel/platform name) is
    // network text, even if it happens to contain a trailing year with
    // no separating comma ("Viu2024" wouldn't reach here since Be On
    // Cloud's own comma always separates it, but a bare "2024" token
    // like this one never has stray letters mixed in).
    const yearMatches = [...part.matchAll(/\d{4}/g)];
    if (yearMatches.length > 0 && /^[\d\s\-–—]+$/.test(part)) {
      year = Number(yearMatches[yearMatches.length - 1][0]);
    } else {
      networkParts.push(part);
    }
  }
  return { title, network: networkParts.length ? networkParts.join(", ") : null, year };
}

export function parseProductionList(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
): { title: string; network: string | null; year: number | null }[] {
  return container
    .find("li")
    .map((_, el) => textWithBreaks($, $(el)))
    .get()
    .filter(Boolean)
    .map(parseProductionListEntry)
    .filter((p) => p.title);
}

/** Reconstructs a wikitable's *visual* grid, expanding `rowspan`/
 *  `colspan` — these tables group same-year or same-network rows by
 *  leaving a cell out of every row but the first, relying on rowspan to
 *  "carry it down". Reading `<td>`s by a fixed index per row — what a
 *  naive parser does — silently shifts every subsequent column left for
 *  those rows. */
export function parseTableGrid($: CheerioAPI, table: Cheerio<AnyNode>): string[][] {
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
      const text = textWithBreaks($, $cell);
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
