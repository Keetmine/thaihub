import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { Page } from "playwright";
import {
  headingByText,
  contentAfterHeading,
  parseNameNicknameList,
  parseProductionList,
} from "@/lib/mediawikiParse";

// Scraper for a talent-agency category page on drama.fandom.com (e.g.
// drama.fandom.com/es/wiki/Categoría:Be_On_Cloud — the "/es/" is just a
// UI-chrome language, the actual content is in English). Same MediaWiki
// software and CC BY-SA license as Wikipedia/tpop.fandom.com (see
// wikipedia-agency-import.md), so this reuses mediawikiParse.ts's
// helpers — but the *page itself* (not just /robots.txt) sits behind a
// Cloudflare bot-check that a plain fetch (even against the official
// `action=parse` API — this wiki's happens to also reject it, unlike
// Wikipedia/tpop.fandom.com's) can't get past, so this needs a real
// browser page, same as gmmtv.ts.

export function parseDramaFandomPageTitle(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/wiki\/([^?#]+)/);
  return decodeURIComponent(match ? match[1] : trimmed).replace(/_/g, " ");
}

async function fetchRenderedHtml(pageUrl: string, page: Page): Promise<string> {
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const el = document.querySelector("#mw-content-text") ?? document.querySelector(".mw-parser-output");
    return el ? el.innerHTML : document.body.innerHTML;
  });
}

/** Walks siblings from right after `startHeading` until the next real
 *  `<h2>`, collecting every `<ul>` name-list found along the way — this
 *  page's "Artistas" section has an "Actrices" h3 sub-list nested as a
 *  plain sibling (this wiki predates the heading-wrapper-div skin, see
 *  mediawikiParse.ts's contentAfterHeading), so both lists get swept up
 *  in one pass without needing to treat the sub-heading specially. */
function collectNameNicknamesUntilNextH2(
  $: CheerioAPI,
  startHeading: Cheerio<AnyNode>,
): { fullName: string; nickname: string }[] {
  const result: { fullName: string; nickname: string }[] = [];
  let node = contentAfterHeading($, startHeading);
  while (node.length && !node.is("h2")) {
    if (node.is("ul")) {
      result.push(...parseNameNicknameList($, node));
    }
    node = node.next();
  }
  return result;
}

export type DramaFandomAgencyData = {
  name: string;
  productions: { title: string; network: string | null; year: number | null }[];
  currentArtists: { fullName: string; nickname: string }[];
  formerArtists: { fullName: string; nickname: string }[];
};

export async function fetchDramaFandomAgencyPage(
  pageUrlOrTitle: string,
  page: Page,
): Promise<DramaFandomAgencyData> {
  const pageUrl = pageUrlOrTitle.startsWith("http")
    ? pageUrlOrTitle
    : `https://drama.fandom.com/wiki/${encodeURIComponent(pageUrlOrTitle.replace(/ /g, "_"))}`;
  const pageTitle = parseDramaFandomPageTitle(pageUrl);

  const html = await fetchRenderedHtml(pageUrl, page);
  const $ = cheerio.load(html);

  // The category-page "Detalles" infobox lists the agency's own display
  // name — falls back to the page title if that field is missing.
  const detailsHeading = headingByText($, "Detalles");
  let name = pageTitle;
  if (detailsHeading.length) {
    // Not just the immediate next sibling — an infobox <figure> (image)
    // usually sits between the heading and the details <ul>.
    const detailsList = detailsHeading.nextAll("ul").first();
    const nameItem = detailsList
      .find("li")
      .filter((_, el) => $(el).text().trim().toLowerCase().startsWith("nombre"))
      .first();
    const nameText = nameItem.text().replace(/^.*?:\s*/, "").trim();
    if (nameText) name = nameText;
  }

  const productionsHeading = headingByText($, "Producciones Filmográficas");
  const productions = productionsHeading.length
    ? parseProductionList($, contentAfterHeading($, productionsHeading))
    : [];

  const artistsHeading = headingByText($, "Artistas");
  const currentArtists = artistsHeading.length ? collectNameNicknamesUntilNextH2($, artistsHeading) : [];

  const formerHeading = headingByText($, "Ex-Artistas");
  const formerArtists = formerHeading.length
    ? parseNameNicknameList($, contentAfterHeading($, formerHeading))
    : [];

  return { name, productions, currentArtists, formerArtists };
}
