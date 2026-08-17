import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { fetchMediaWikiParsedHtml, textWithBreaks } from "@/lib/mediawikiParse";

// Scraper for tpop.fandom.com band/member articles (e.g.
// tpop.fandom.com/wiki/BUS) — Fandom wikis are CC BY-SA licensed, same
// as Wikipedia (see wikipediaAgency.ts), and run the same MediaWiki
// software with an official `action=parse` API, so this reuses the same
// shared parsing helpers rather than re-scraping raw HTML. Pure
// functions, no DB access, same split as every other importer here.
//
// Fetching the plain page (and even /robots.txt) directly hits a
// Cloudflare bot-check page — but api.php itself answers cleanly with no
// challenge, so that's the access path used here, exactly as intended
// for an API endpoint (as opposed to working around the challenge on
// the rendered page, which this does not attempt).

const UA = "MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";
const API_BASE = "https://tpop.fandom.com/api.php";

/** Extracts the page title from either a bare title or a full
 *  tpop.fandom.com/wiki/{Title} URL. */
export function parseTpopPageTitle(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/wiki\/([^?#]+)/);
  const raw = match ? match[1] : trimmed;
  // Названия вида «100%» — голый процент не декодируется (URI malformed).
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return decoded.replace(/_/g, " ");
}

function infoboxValue($: CheerioAPI, infobox: Cheerio<AnyNode>, label: string): Cheerio<AnyNode> | null {
  const item = infobox
    .find(".pi-item")
    .filter((_, el) => $(el).find(".pi-data-label").text().trim() === label)
    .first();
  if (!item.length) return null;
  const value = item.find(".pi-data-value");
  return value.length ? value : null;
}

function infoboxText($: CheerioAPI, infobox: Cheerio<AnyNode>, label: string): string | null {
  const value = infoboxValue($, infobox, label);
  if (!value) return null;
  const text = textWithBreaks($, value);
  return text || null;
}

function infoboxImage($: CheerioAPI, infobox: Cheerio<AnyNode>): string | null {
  const src = infobox.find(".pi-image img").first().attr("src") ?? null;
  if (!src) return null;
  const abs = src.startsWith("http") ? src : `https:${src}`;
  // Викия отдаёт …/Имя.webp/revision/latest/scale-to-width-down/268?cb=… —
  // последний сегмент у ВСЕХ картинок одинаковый («268»), из-за чего
  // downloadRemoteImage сохранял фото разных людей в один файл (фото
  // Билкина перезаписало фото Брайта). Базовый URL без /revision/ отдаёт
  // тот же файл под настоящим именем.
  return abs.replace(/\/revision\/.*$/, "");
}

/** A bilingual field ("Pasawee Sriarunotai (พศวีร์ ศรีอรุโณทัย)", or the
 *  same shape after a `<br>`-joined pair becomes "Name, (Thai script)")
 *  — this keeps only the Latin-script name before the parenthetical. */
function stripParenthetical(text: string): string | null {
  const before = text.split("(")[0].replace(/,\s*$/, "").trim();
  return before || null;
}

/** "SONRAY MUSIC (2023-present), Nadao Bangkok (2020-2022?)" — an
 *  agency field lists every agency a member has ever been under,
 *  `<br>`-joined (see textWithBreaks); this picks the one still marked
 *  "present", falling back to the first entry if none is (a page not
 *  using that convention) rather than returning nothing. */
function parseCurrentAgencyName(rawAgencyField: string | null): string | null {
  if (!rawAgencyField) return null;
  const segments = rawAgencyField
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => {
      const match = segment.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      return match ? { name: match[1].trim(), range: match[2] } : { name: segment, range: "" };
    })
    .filter((s) => s.name);
  if (segments.length === 0) return null;
  return (segments.find((s) => /present/i.test(s.range)) ?? segments[0]).name;
}

/** "December 12, 2002 (age 23)" -> Date for Dec 12 2002. Returns null if
 *  the field is missing or in a shape `Date` can't parse (rare, but a
 *  member page occasionally has "TBA" or a season instead of a date). */
function parseTpopDate(raw: string | null): Date | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s*\(age\s*\d+\)\s*$/i, "").trim();
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type TpopBandMemberLink = { name: string; href: string };

export type TpopBandData = {
  name: string;
  photoUrl: string | null;
  origin: string | null;
  genre: string | null;
  debut: string | null;
  label: string | null;
  members: TpopBandMemberLink[];
};

export async function fetchTpopBandPage(pageTitleOrUrl: string): Promise<TpopBandData> {
  const pageTitle = parseTpopPageTitle(pageTitleOrUrl);
  const html = await fetchMediaWikiParsedHtml(API_BASE, pageTitle, UA);
  const $ = cheerio.load(html);
  const infobox = $(".portable-infobox").first();

  // "Current" lineup — a page's big historical Members table (kept
  // separately, further down the article) also lists pre-debut/departed
  // members, which don't belong in a band's current roster. У
  // РАСПАВШИХСЯ групп (SIZZY) поля Current нет вовсе — состав лежит в
  // «Former»: без этого фолбэка страница выглядела как соло-артист
  // (0 участников) и импортёр создавал группу типом SOLO.
  const membersFrom = (label: string): TpopBandMemberLink[] => {
    const value = infoboxValue($, infobox, label);
    if (!value) return [];
    // Участник — либо синяя ссылка, либо «красная» (страницы нет,
    // <span class="new">, у Bodyslam-подобных рок-групп весь состав
    // такой) — без них страница выглядела соло-артистом.
    return value
      .find("li")
      .toArray()
      .map((el) => {
        const $li = $(el);
        const $a = $li.find("a").first();
        if ($a.length) return { name: $a.text().trim(), href: $a.attr("href") ?? "" };
        return { name: $li.text().trim(), href: "" };
      })
      .filter((m) => m.name);
  };
  const current = membersFrom("Current");
  const members = current.length > 0 ? current : membersFrom("Former");

  return {
    name: pageTitle,
    photoUrl: infoboxImage($, infobox),
    origin: infoboxText($, infobox, "Origin"),
    genre: infoboxText($, infobox, "Genre(s)"),
    debut: infoboxText($, infobox, "Debut"),
    label: infoboxText($, infobox, "Label(s)"),
    members,
  };
}

export type TpopMemberData = {
  stageName: string;
  birthName: string | null;
  birthDate: Date | null;
  birthPlace: string | null;
  agency: string | null;
  photoUrl: string | null;
};

export async function fetchTpopMemberPage(pageTitleOrUrl: string): Promise<TpopMemberData> {
  const pageTitle = parseTpopPageTitle(pageTitleOrUrl);
  const html = await fetchMediaWikiParsedHtml(API_BASE, pageTitle, UA);
  const $ = cheerio.load(html);
  const infobox = $(".portable-infobox").first();

  const otherName = infoboxText($, infobox, "Other name(s)");
  const stageName = (otherName ? stripParenthetical(otherName) : null) ?? pageTitle;

  // A "Legal name" (current legal name, after any change) takes priority
  // over "Birth name" (name at birth) when a page has both — hit for
  // real on DICE's Jay, who has separate legal-name-change history.
  const legalOrBirthName =
    infoboxText($, infobox, "Legal name") ?? infoboxText($, infobox, "Birth name");

  return {
    stageName,
    birthName: legalOrBirthName ? stripParenthetical(legalOrBirthName) : null,
    birthDate: parseTpopDate(infoboxText($, infobox, "Birth date")),
    birthPlace: infoboxText($, infobox, "Birth place"),
    agency: parseCurrentAgencyName(infoboxText($, infobox, "Agency")),
    photoUrl: infoboxImage($, infobox),
  };
}
