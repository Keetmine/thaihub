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
    .filter((_, el) => $(el).text().trim().toLowerCase() === text.toLowerCase())
    .first();
}

/** The element that visually follows a heading is its *wrapper* div's
 *  next sibling, not the heading tag's own — modern Wikipedia/Fandom
 *  wrap every heading in a `<div class="mw-heading">`. Some pages (hit
 *  for real on GMMTV's "Former" section) insert a stray non-content
 *  element — an empty `<link>`, `<style>`, etc. — right after the
 *  wrapper before the actual content, so this skips forward past those
 *  instead of blindly trusting the first sibling. */
export function contentAfterHeading($: CheerioAPI, heading: Cheerio<AnyNode>): Cheerio<AnyNode> {
  let node = heading.parent().next();
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
