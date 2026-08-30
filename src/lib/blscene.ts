import * as cheerio from "cheerio";
import type { Browser } from "playwright";
import { assertPublicHttpUrl, fetchPublicUrl } from "@/lib/urlGuard";

// Scraper for blscene.com's "where was X filmed" pages — a public,
// straightforward-HTML WordPress site listing BL drama filming locations.
// Pure functions only: no DB access here (see blsceneImport.ts for that),
// so this module is safe to import from both the Next.js app and a
// standalone tsx script.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";

const INDEX_URL = "https://blscene.com/where-were-they-filmed-bl-shows-a-z/";

export type BlsceneDramaLink = { title: string; year: number | null; url: string };

export type BlsceneLocation = {
  name: string;
  areaText: string | null;
  mapsUrl: string | null;
  photoUrl: string | null;
};

export type BlsceneDrama = {
  title: string;
  year: number | null;
  posterUrl: string | null;
  synopsis: string | null;
  mydramalistUrl: string | null;
  sourceUrl: string;
  locations: BlsceneLocation[];
};

async function fetchHtml(url: string): Promise<string> {
  // Сюда приходят только адреса blscene.com (индекс и ссылки с него),
  // но провалидированный fetch ничего не стоит — а если однажды сюда
  // протечёт чужой адрес, он не сможет увести нас во внутреннюю сеть.
  const res = await fetchPublicUrl(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/** The A-Z index — every drama title blscene has a filming-locations page for. */
export async function fetchBlsceneIndex(): Promise<BlsceneDramaLink[]> {
  const html = await fetchHtml(INDEX_URL);
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const results: BlsceneDramaLink[] = [];

  $('a[href^="https://blscene.com/where-was-"]').each((_, el) => {
    const $a = $(el);
    const url = $a.attr("href");
    if (!url || seen.has(url)) return;
    const title = $a.text().trim();
    if (!title) return;

    // The year sits as plain text right after the link, e.g. "</a> (2020)".
    const next = el.nextSibling;
    const afterText = next && next.type === "text" ? (next as unknown as { data: string }).data : "";
    const yearMatch = afterText.match(/\((\d{4})\)/);

    seen.add(url);
    results.push({ title, year: yearMatch ? parseInt(yearMatch[1], 10) : null, url });
  });

  return results;
}

/** One drama's filming-locations page: profile fields + every location listed. */
export async function scrapeBlsceneDrama(url: string): Promise<BlsceneDrama> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const title = $(".PostTitle span").first().text().trim();

  const introParas = $(".post-content .uncode_text_column p");
  const firstParaText = introParas.first().text().trim();
  const yearMatch = firstParaText.match(/^(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const mydramalistUrl = introParas.first().find('a[href*="mydramalist.com"]').attr("href") ?? null;
  const synopsis = introParas.eq(1).text().trim() || null;

  const bgMatch = html.match(/background-image:\s*url\(([^)]+)\)/);
  const posterUrl = bgMatch ? bgMatch[1] : null;

  const locations: BlsceneLocation[] = [];
  const seenNames = new Set<string>();

  $("h3").each((_, el) => {
    const $h3 = $(el);
    const name = $h3.text().trim();
    if (!name || seenNames.has(name)) return;

    const $p = $h3.nextAll("p").first();
    const pText = $p.text().trim();
    const mapsUrl = $p.find("a").attr("href") ?? null;
    // Filters out unrelated <h3>s (nav, footer, etc.) — real location
    // entries always have the "Area | Map" line right after them.
    if (!mapsUrl) return;

    const areaText = pText.split("|")[0]?.trim() || null;
    const photoUrl = $h3.closest(".wpb_column").find("img").first().attr("src") ?? null;

    seenNames.add(name);
    locations.push({ name, areaText, mapsUrl, photoUrl });
  });

  return { title, year, posterUrl, synopsis, mydramalistUrl, sourceUrl: url, locations };
}

/**
 * Хосты, на которые вообще имеет смысл ходить за координатами Google
 * Maps. Ссылку сюда вставляет ПОЛЬЗОВАТЕЛЬ (места в списках/поездках),
 * поэтому одного запрета приватных адресов мало: без allowlist сервер
 * можно было бы гонять по любым публичным URL (и даже открывать их в
 * headless-браузере в resolveMapsCoords). Не-Google ссылка координат в
 * гугловском формате всё равно не даст — extractCoordsFromText ищет
 * только !3d!4d и @lat,lng, — так что allowlist ничего легального не
 * ломает: и blscene-импорт, и ручной ввод несут именно эти хосты.
 */
function isAllowedMapsHost(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  const suffixes = ["google.com", "goo.gl", "g.co"];
  return suffixes.some((s) => host === s || host.endsWith(`.${s}`));
}

/** null вместо броска: контракт резолверов — «координат нет», и
 *  вызывающие (импорт, экшен списков) продолжают без координат. */
function checkMapsUrl(url: string): boolean {
  try {
    return isAllowedMapsHost(assertPublicHttpUrl(url));
  } catch {
    return false;
  }
}

function extractCoordsFromText(text: string): { lat: number; lng: number } | null {
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // malformed percent-encoding — fall back to the raw string
  }
  const m1 = decoded.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m1) return { lat: parseFloat(m1[1]), lng: parseFloat(m1[2]) };
  const m2 = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+),\d/);
  if (m2) return { lat: parseFloat(m2[1]), lng: parseFloat(m2[2]) };
  return null;
}

/**
 * Дешёвый резолв без браузера: идём по HTTP-редиректам (maps.app.goo.gl
 * отдаёт обычный 302) и ищем координаты в каждом следующем URL, включая
 * consent-обёртку (?continue=...). Покрывает ссылки, чей конечный URL
 * несёт @lat,lng или !3d!4d; ссылки формата ?q=адрес&ftid=… координат в
 * URL не имеют — для них вернётся null, и вызывающий решает, звать ли
 * браузер (проверено вживую 2026-08-22: тело той страницы рендерится JS,
 * без браузера координаты не достать).
 */
export async function resolveMapsCoordsViaHttp(
  url: string,
): Promise<{ lat: number; lng: number } | null> {
  const direct = extractCoordsFromText(url);
  if (direct) return direct;

  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    // Каждый хоп — под проверкой: и первый (пользовательский) адрес, и
    // адреса из Location-заголовков. Иначе безобидный goo.gl мог бы
    // отредиректить на http://10.0.0.1/… — и мы бы туда сходили.
    if (!checkMapsUrl(current)) return null;
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; MyBLHubImporter/1.0)" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return null;
    }
    void res.body?.cancel().catch(() => {});
    const next = res.headers.get("location");
    if (!next) return null;
    const absolute = new URL(next, current).toString();
    const found = extractCoordsFromText(absolute);
    if (found) return found;
    try {
      const cont = new URL(absolute).searchParams.get("continue");
      if (cont) {
        const fromCont = extractCoordsFromText(cont);
        if (fromCont) return fromCont;
      }
    } catch {
      // not a well-formed URL — keep following hops
    }
    current = absolute;
  }
  return null;
}

/**
 * Resolve a Google Maps link to coordinates. Long-form
 * google.com/maps/place/... links already carry them in the URL (no browser
 * needed). Short maps.app.goo.gl links redirect server-side, but часть из
 * них ведёт на ?q=адрес&ftid=…-форму без координат в URL — тогда нужен
 * реальный браузер: навигируемся и вытаскиваем координаты из того, куда
 * приземлились, включая Google's occasional cookie-consent interstitial,
 * which embeds the real destination (and its coordinates) in a
 * `continue=` param.
 */
export async function resolveMapsCoords(
  url: string,
  browser: Browser,
): Promise<{ lat: number; lng: number } | null> {
  const direct = extractCoordsFromText(url);
  if (direct) return direct;

  // Браузерный fallback опаснее голого fetch (goto исполняет JS и сам
  // ходит по редиректам), поэтому НИКУДА, кроме Google, не навигируемся.
  if (!checkMapsUrl(url)) return null;

  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const finalUrl = page.url();
    const fromUrl = extractCoordsFromText(finalUrl);
    if (fromUrl) return fromUrl;

    try {
      const cont = new URL(finalUrl).searchParams.get("continue");
      if (cont) return extractCoordsFromText(cont);
    } catch {
      // not a well-formed URL — nothing more to try
    }
    return null;
  } finally {
    await page.close();
  }
}
