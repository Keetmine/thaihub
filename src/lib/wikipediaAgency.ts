import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import {
  fetchMediaWikiParsedHtml,
  headingByText,
  contentAfterHeading,
  parseTableGrid,
  parseNameNicknameList,
  parseProductionList,
} from "@/lib/mediawikiParse";

// Scraper for an English Wikipedia talent-agency article (e.g.
// en.wikipedia.org/wiki/Domundi_TV). Wikipedia's content is CC BY-SA
// (reuse explicitly permitted) and its robots.txt has no AI/bot
// disallow — a real contrast with TMDB/IMDb (see tmdb-import.md), and
// there's an official API built for exactly this. Pure functions, no DB
// access, same split as every other importer in this project.

const UA = "ThaiHubImporter/1.0 (personal fan-tracker, contact via site)";
const API_BASE = "https://en.wikipedia.org/w/api.php";

/** Extracts the page title from either a bare title or a full
 *  en.wikipedia.org/wiki/{Title} URL. */
export function parseWikipediaPageTitle(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/wiki\/([^?#]+)/);
  return decodeURIComponent(match ? match[1] : trimmed).replace(/_/g, " ");
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
  const html = await fetchMediaWikiParsedHtml(API_BASE, pageTitle, UA);
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
  // tmdb-import.md's known-for filtering for the same reasoning). Not
  // every agency's page uses the same heading text for that section —
  // GMMTV's is "TV series", Change2561's is "Television dramas" — so
  // this tries each known variant in order and takes the first that
  // actually parses out any rows. Deliberately excludes headings like
  // "Drama" (GMMTV's, but a separate older/pre-BL-era catalog, out of
  // scope here) and "TV shows" (GMMTV's variety-show table, same
  // reality-show exclusion as above) to keep this from silently pulling
  // in unrelated content.
  //
  // The section itself isn't always a wikitable either — Change2561's
  // is a plain <ul> of "Title (Year)"/"Title (YearStart–YearEnd)"
  // entries, so each candidate tries table parsing first (the richer
  // shape, when present) and falls back to list parsing.
  const seriesHeadingCandidates = ["Television series", "TV series", "Television dramas"];
  let productions: { year: number | null; title: string; network: string | null }[] = [];
  for (const candidate of seriesHeadingCandidates) {
    const heading = headingByText($, candidate);
    if (!heading.length) continue;
    const content = contentAfterHeading($, heading);
    const table = content.is("table") ? content : content.find("table").first();
    const parsed = table.length
      ? parseProductionsTable($, table)
      : parseProductionList($, content).map((p) => ({ year: p.year, title: p.title, network: p.network }));
    if (parsed.length > 0) {
      productions = parsed;
      break;
    }
  }

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
        currentArtists.push(...parseNameNicknameList($, node));
      }
      node = node.next();
    }
  }

  const formerHeading = headingByText($, "Former");
  const formerArtists = formerHeading.length
    ? parseNameNicknameList($, contentAfterHeading($, formerHeading))
    : [];

  return { name, description, logoUrl, productions, upcoming, currentArtists, formerArtists };
}
