import * as cheerio from "cheerio";

export type ScrapedDrama = {
  title: string;
  mydramalistUrl?: string;
  year?: number;
};

export type ScrapedPerson = {
  name?: string;
  photoUrl?: string;
  bio?: string;
  dramas: ScrapedDrama[];
};

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function resolveUrl(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function firstNonEmpty(...values: (string | undefined | null)[]): string | undefined {
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function extractYear(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const match = text.match(/\b(19|20)\d{2}\b/);
  if (!match) return undefined;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : undefined;
}

/**
 * Fetches a mydramalist.com person profile page and extracts basic profile
 * info + filmography. mydramalist sits behind Cloudflare's managed bot
 * challenge, which a plain server-side fetch cannot solve — this will throw
 * for essentially every request. Kept mainly so a future change in their
 * bot-protection can start working automatically; the practical path today
 * is {@link parsePersonHtml} fed with HTML pasted from a real browser (see
 * `importFromMydramalistHtml` in the admin actions).
 */
export async function scrapePerson(url: string): Promise<ScrapedPerson> {
  let html: string;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      throw new Error(`mydramalist ответил статусом ${res.status}`);
    }

    html = await res.text();
  } catch (err) {
    throw new Error(
      `Не удалось загрузить страницу mydramalist: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return parsePersonHtml(html, url);
}

/**
 * Parses a mydramalist.com person profile page's HTML (already fetched by
 * some other means — e.g. pasted by the admin from their own browser, which
 * gets past Cloudflare's challenge for them) into profile info + filmography.
 * Markup on mydramalist can shift over time, so every field is parsed
 * defensively — a selector miss just leaves that field undefined rather than
 * throwing, so a partial scrape still returns whatever it managed to find.
 */
export function parsePersonHtml(html: string, url: string): ScrapedPerson {
  if (/just a moment/i.test(html) && /cloudflare/i.test(html)) {
    throw new Error(
      "Это страница Cloudflare-проверки, а не сам профиль. Откройте ссылку в браузере, дождитесь загрузки настоящей страницы и скопируйте код уже после этого.",
    );
  }

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch (err) {
    throw new Error(
      `Не удалось разобрать страницу mydramalist: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const result: ScrapedPerson = { dramas: [] };

  // --- Name ---
  try {
    result.name = firstNonEmpty(
      $("h1.film-title a").first().text(),
      $("h1.film-title").first().text(),
      $(".film-title").first().text(),
      $("h1").first().text(),
    );
  } catch {
    // leave name undefined
  }

  // --- Photo ---
  try {
    const candidates = [
      $(".film-cover img").first(),
      $(".cover img").first(),
      $("img.film-poster").first(),
      $(".box-body img").first(),
    ];
    for (const img of candidates) {
      if (!img || img.length === 0) continue;
      const src = firstNonEmpty(
        img.attr("data-src"),
        img.attr("data-original"),
        img.attr("src"),
      );
      if (src) {
        result.photoUrl = resolveUrl(src, url);
        break;
      }
    }
  } catch {
    // leave photoUrl undefined
  }

  // --- Bio ---
  try {
    result.bio = firstNonEmpty(
      $(".show-synopsis span").first().text(),
      $(".show-synopsis").first().text(),
      $("#show-synopsis").first().text(),
      $(".col-film-content p").first().text(),
      $(".bio").first().text(),
    );
  } catch {
    // leave bio undefined
  }

  // --- Filmography / dramas ---
  try {
    const seen = new Set<string>();
    const rowSelectors = [
      ".credits-list .credits-row",
      ".list.credits-list li",
      "#dramas .credits-row",
      ".box-body .credits-row",
      ".filmo .credits-row",
    ];

    for (const selector of rowSelectors) {
      $(selector).each((_, el) => {
        const row = $(el);
        const link = row.find("a.text-primary").first().length
          ? row.find("a.text-primary").first()
          : row.find("a").first();
        if (!link || link.length === 0) return;

        const title = link.text().trim();
        if (!title) return;

        const href = link.attr("href");
        const mydramalistUrl = resolveUrl(href, url);
        const key = (mydramalistUrl ?? title).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        const year =
          extractYear(row.find(".text-muted").first().text()) ?? extractYear(row.text());

        result.dramas.push({ title, mydramalistUrl, year });
      });

      if (result.dramas.length > 0) break;
    }
  } catch {
    // leave dramas as whatever was collected so far
  }

  return result;
}
