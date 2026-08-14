import type { Page } from "playwright";

// Scraper for gmm-tv.com's artist roster. Pure functions only: no DB
// access here (see gmmtvImport.ts for that), so this module is safe to
// import from both the Next.js app and a standalone script.
//
// Unlike blscene/thaiticketmajor, EVERY request here needs a real browser
// page, not just a plain `fetch`: the site sits behind Cloudflare (plain
// HTTP gets a 403) and the artist grid + profile fields are rendered by
// client-side JS, not present in the initial HTML.

const ARTISTS_INDEX_URL = "https://www.gmm-tv.com/artists/";

export type GmmtvArtistLink = { id: string; url: string };

export type GmmtvArtist = {
  nickname: string;
  fullName: string;
  birthDate: string | null; // "YYYY-MM-DD", never a Date — see scrapeGmmtvArtist
  photoUrl: string | null;
  socialLinks: { label: string; url: string }[];
  sourceUrl: string;
};

/** Every artist profile URL listed on the roster grid, deduped by id. */
export async function fetchGmmtvArtistLinks(page: Page): Promise<GmmtvArtistLink[]> {
  await page.goto(ARTISTS_INDEX_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  const hrefs = await page.$$eval("a", (els) =>
    els.map((e) => (e as HTMLAnchorElement).href).filter((h) => /\/artists\/view\/\d+\/?$/.test(h)),
  );

  const seen = new Set<string>();
  const links: GmmtvArtistLink[] = [];
  for (const url of hrefs) {
    const match = url.match(/\/artists\/view\/(\d+)\/?$/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    links.push({ id: match[1], url });
  }
  return links;
}

const MONTH_NAMES_EN = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Parses "Date of Birth : 30 October 1991, Weight : 65 kg. Height : 177 cm."
 *  into a plain "YYYY-MM-DD" string. */
function parseBirthDateText(text: string): string | null {
  const match = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return null;
  const [, dayStr, monthName, yearStr] = match;
  const monthIndex = MONTH_NAMES_EN.indexOf(monthName.toLowerCase());
  if (monthIndex === -1) return null;
  const pad = (n: string | number) => String(n).padStart(2, "0");
  return `${yearStr}-${pad(monthIndex + 1)}-${pad(dayStr)}`;
}

/**
 * Splits GMMTV's "{EN nickname} : {EN full name} {TH nickname} : {TH full
 * name}" title into the English half we actually store — the Thai half
 * has no field to go in and is dropped. Split point is the first Thai
 * Unicode character (U+0E00–U+0E7F).
 */
function parseArtistTitle(ogTitle: string): { nickname: string; fullName: string } {
  const thaiMatch = ogTitle.match(/[฀-๿]/);
  const englishPart = (thaiMatch ? ogTitle.slice(0, thaiMatch.index) : ogTitle).trim();
  const [nicknamePart, ...rest] = englishPart.split(":");
  return {
    nickname: nicknamePart.trim(),
    fullName: rest.join(":").trim(),
  };
}

const SOCIAL_PATTERN = /facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com/i;

function labelForSocialUrl(url: string): string {
  if (/facebook\.com/i.test(url)) return "Facebook";
  if (/instagram\.com/i.test(url)) return "Instagram";
  if (/twitter\.com|x\.com/i.test(url)) return "Twitter";
  if (/tiktok\.com/i.test(url)) return "TikTok";
  if (/youtube\.com/i.test(url)) return "YouTube";
  return "Соцсеть";
}

export async function scrapeGmmtvArtist(url: string, page: Page): Promise<GmmtvArtist> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);

  const data = await page.evaluate(() => {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "";
    const ogDescription =
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? "";
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "";
    const links = [...document.querySelectorAll("a")].map((a) => (a as HTMLAnchorElement).href);
    return { ogTitle, ogDescription, ogImage, links };
  });

  const { nickname, fullName } = parseArtistTitle(data.ogTitle);
  const birthDate = parseBirthDateText(data.ogDescription);
  const socialUrls = [...new Set(data.links.filter((l) => SOCIAL_PATTERN.test(l)))];

  return {
    nickname,
    fullName,
    birthDate,
    photoUrl: data.ogImage || null,
    socialLinks: socialUrls.map((u) => ({ label: labelForSocialUrl(u), url: u })),
    sourceUrl: url,
  };
}
