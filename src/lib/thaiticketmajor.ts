import * as cheerio from "cheerio";

// Scraper for thaiticketmajor.com event pages. Pure functions only: no DB
// access here (see thaiticketmajorImport.ts for that), so this module is
// safe to import from both the Next.js app and a standalone script.
//
// Two data sources on each page:
//  - a `schema.org/Event` JSON-LD block: title, dates, venue, poster —
//    reliable and consistent site-wide.
//  - a free-text "details" table (admin-entered per event, not guaranteed
//    to have every row) that's the only place the artist lineup and the
//    display price string live. The site renders this table in Thai by
//    default; setting the `__la=en` cookie (what its own language-switch
//    button does client-side) gets the same table back in English with a
//    plain HTTP request — no headless browser needed.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 ThaiHubImporter/1.0 (personal fan-tracker, contact via site)";

export type TtmArtist = { fullName: string; nickname: string };

export type TtmEvent = {
  title: string;
  venue: string | null;
  posterUrl: string | null;
  // Kept as plain "YYYY-MM-DD" / "HH:mm" strings, sliced directly out of
  // the JSON-LD's naive ISO datetime (no trailing "Z"/offset — it's
  // already Bangkok wall-clock time). Deliberately NOT parsed through
  // `new Date(...)`: that would reinterpret it in whatever timezone the
  // Node process happens to run in, silently shifting the hour — the
  // same "local wall-clock, no explicit timezone" convention the rest of
  // the app already relies on (see combineDateTime in events/actions.ts).
  date: string | null;
  startTime: string | null;
  dateRangeText: string | null;
  ticketPrice: string | null;
  // When tickets go on sale ("Public Sale" in the page's summary panel,
  // distinct from the free-text details table below it) — same
  // date/time-as-strings treatment as `date`/`startTime` above, and same
  // reason (no timezone reinterpretation). Only the first "Public Sale"
  // entry is used when a page lists several sale phases (e.g. presale
  // then general sale).
  presaleDate: string | null;
  presaleTime: string | null;
  artists: TtmArtist[];
  sourceUrl: string;
};

const MONTH_NAMES_EN = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Parses "Saturday 22 August 2026, 10:00" into {date, time} strings. */
function parseEnglishDateTime(text: string): { date: string; time: string } | null {
  const match = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\D+(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [, dayStr, monthName, yearStr, hourStr, minuteStr] = match;
  const monthIndex = MONTH_NAMES_EN.indexOf(monthName.toLowerCase());
  if (monthIndex === -1) return null;
  const pad = (n: string | number) => String(n).padStart(2, "0");
  return {
    date: `${yearStr}-${pad(monthIndex + 1)}-${pad(dayStr)}`,
    time: `${pad(hourStr)}:${pad(minuteStr)}`,
  };
}

async function fetchEnglishHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: "__la=en" },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/**
 * Splits one "Artists" row entry into {fullName, nickname}. The site uses
 * two different formats depending on who entered the data, with no shared
 * delimiter:
 *   "Jakrapatr Kaewpanpong (William)"  — full name, nickname in parens
 *   "Earth Pirapat Watthanasetsiri"    — nickname first, then full name
 * The second form is genuinely ambiguous (nothing marks where the
 * nickname ends), so this is a best-effort heuristic (first word =
 * nickname) — callers must let a human confirm/edit before saving.
 */
export function parseArtistLine(raw: string): TtmArtist {
  const text = raw.replace(/\s+/g, " ").trim();

  const parenMatch = text.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    return { fullName: parenMatch[1].trim(), nickname: parenMatch[2].trim() };
  }

  const words = text.split(" ");
  if (words.length >= 2) {
    return { fullName: words.slice(1).join(" "), nickname: words[0] };
  }
  return { fullName: text, nickname: text };
}

function findLabeledRow($: cheerio.CheerioAPI, label: string) {
  return $("tr").filter((_, el) => {
    const firstCellText = $(el).find("td").first().text().replace(/\s+/g, " ").trim();
    return firstCellText.toLowerCase().startsWith(label.toLowerCase());
  });
}

export async function scrapeTtmEvent(url: string): Promise<TtmEvent> {
  const html = await fetchEnglishHtml(url);
  const $ = cheerio.load(html);

  let title = "";
  let venue: string | null = null;
  let posterUrl: string | null = null;
  let date: string | null = null;
  let startTime: string | null = null;

  const ldJson = $("script#json-ld-event, script[type=\"application/ld+json\"]").first().html();
  if (ldJson) {
    try {
      const data = JSON.parse(ldJson);
      title = data.name ?? "";
      venue = data.location?.name ?? null;
      posterUrl = data.image ?? null;
      // "2026-10-24T18:00:00" — no timezone suffix, already Bangkok
      // wall-clock time. String-slice it; don't hand it to `new Date()`.
      const raw: string | undefined = data.startDate;
      if (raw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
        date = raw.slice(0, 10);
        startTime = raw.slice(11, 16);
      }
    } catch {
      // malformed JSON-LD — fields stay at their defaults, the free-text
      // table below still fills in title/venue if this block is unusable
    }
  }

  const dateRow = findLabeledRow($, "Date");
  const dateRangeText = dateRow.find("td").eq(1).text().replace(/\s+/g, " ").trim() || null;

  if (!title) {
    title = findLabeledRow($, "Event Title").find("td").eq(1).text().trim();
  }
  if (!venue) {
    venue = findLabeledRow($, "Venue").find("td").eq(1).text().replace(/\s+/g, " ").trim() || null;
  }

  const priceRow = findLabeledRow($, "Ticket Price");
  const ticketPrice = priceRow.find("td").eq(1).text().replace(/\s+/g, " ").trim() || null;

  let presaleDate: string | null = null;
  let presaleTime: string | null = null;
  const publicSaleLabel = $("small").filter((_, el) => $(el).text().trim() === "Public Sale").first();
  const publicSaleText = publicSaleLabel.parent().find("span").first().text().replace(/\s+/g, " ").trim();
  if (publicSaleText) {
    const parsed = parseEnglishDateTime(publicSaleText);
    if (parsed) {
      presaleDate = parsed.date;
      presaleTime = parsed.time;
    }
  }

  const artistsRow = findLabeledRow($, "Artists");
  const artists: TtmArtist[] = artistsRow
    .find("td")
    .eq(1)
    .find("div")
    .map((_, el) => $(el).text())
    .get()
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map(parseArtistLine);

  return {
    title,
    venue,
    posterUrl,
    date,
    startTime,
    dateRangeText,
    ticketPrice,
    presaleDate,
    presaleTime,
    artists,
    sourceUrl: url,
  };
}
