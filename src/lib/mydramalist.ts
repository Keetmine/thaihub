import type { DramaStatus } from "@/generated/prisma/client";

// Парсеры страниц MyDramaList. Официального API у MDL нет (ключи выдают
// только «партнёрам»), парсим страницы:
// - тайтлы и поиск отдаются обычным GET'ом с браузерным User-Agent;
// - раздел /people/ закрыт Cloudflare-челленджем — его нужно ходить
//   через реальный браузер (см. scripts/mdl-sync-performers.ts: headed
//   chromium решает челлендж, дальше его cookie используются для
//   быстрых HTTP-запросов через context.request).
// Данные берутся из schema.org JSON-LD + блока Details в HTML.

export const MDL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const MDL_ORIGIN = "https://mydramalist.com";

// ---------- общие помощники ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

/** Текст страницы с | между тегами — для label-регэкспов по Details. */
function pipeText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "|")
      .replace(/<[^>]+>/g, "|"),
  ).replace(/\|+/g, "|");
}

function detailFrom(text: string, label: string): string | null {
  return text.match(new RegExp(`${label}:[|\\s]*([^|]+)`))?.[1]?.trim() || null;
}

function parseMdlDate(s: string): Date | null {
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      // не наш блок
    }
  }
  return out;
}

export function absMdlUrl(path: string): string {
  return path.startsWith("http") ? path : `${MDL_ORIGIN}${path}`;
}

// ---------- сериал ----------

export type MdlRelatedEntry = { url: string; title: string; relation: string | null };

export type MdlDrama = {
  url: string;
  title: string;
  nativeTitle: string | null;
  alsoKnownAs: string | null;
  synopsis: string | null;
  posterUrl: string | null;
  genres: string[];
  tags: string[];
  director: string | null;
  screenwriter: string | null;
  network: string | null;
  episodes: number | null;
  airedFrom: Date | null;
  airedTo: Date | null;
  airedOn: string | null;
  duration: string | null;
  contentRating: string | null;
  year: number | null;
  status: DramaStatus | null;
  rating: number | null;
  related: MdlRelatedEntry[];
  cast: MdlCastMember[];
};

type JsonLdTvSeries = {
  "@type"?: string;
  name?: string;
  image?: string;
  description?: string;
  genre?: string[];
  datePublished?: string;
  aggregateRating?: { ratingValue?: number };
};

/** Статус выводится из дат эфира — на самой странице его нет отдельным полем. */
function deriveStatus(from: Date | null, to: Date | null): DramaStatus | null {
  const now = new Date();
  if (from && from > now) return "PLANNED";
  if (to && to < now) return "ENDED";
  if (from && from <= now) return "RETURNING_SERIES";
  return null;
}

/** Ссылки из li блока Details по подписи ("Director:", "Screenwriter:"). */
function detailLinksText(html: string, label: string): string | null {
  const li = html.match(
    new RegExp(`<b class="inline">${label}:</b>([\\s\\S]*?)</li>`),
  )?.[1];
  if (!li) return null;
  const names = [...li.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((m) => m[1].trim());
  const text = names.length > 0 ? names.join(", ") : stripTags(li);
  return text || null;
}

export function parseMdlDramaPage(html: string, url: string): MdlDrama {
  let ld: JsonLdTvSeries | null = null;
  for (const block of jsonLdBlocks(html)) {
    const b = block as JsonLdTvSeries;
    if (b["@type"] === "TVSeries" || b["@type"] === "Movie") {
      ld = b;
      break;
    }
  }
  if (!ld?.name) {
    throw new Error("Не удалось разобрать страницу (нет JSON-LD с данными сериала)");
  }

  const text = pipeText(html);

  // Полный синопсис из div.show-synopsis (JSON-LD режет длинные).
  let synopsis: string | null = null;
  const syn = html.match(/<div class="show-synopsis">([\s\S]*?)(?:<ul id="mdl-synopsis|<\/div>)/);
  if (syn) {
    synopsis = stripTags(syn[1].replace(/<a[^>]*>[\s\S]*?<\/a>/g, " "))
      .replace(/Edit Translation/g, "")
      .trim() || null;
  }
  if (!synopsis) synopsis = ld.description?.trim() || null;
  synopsis = stripMdlSelfAttribution(synopsis);

  // Related Content: li.related-content с div.title (ссылка + подпись).
  const related: MdlRelatedEntry[] = [];
  const rel = html.match(/related-content">[\s\S]*?<\/li>/);
  if (rel) {
    for (const m of rel[0].matchAll(
      /<div class="title">\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>([\s\S]*?)<\/div>/g,
    )) {
      const tail = stripTags(m[3]);
      related.push({
        url: absMdlUrl(m[1]),
        title: decodeEntities(m[2]).trim(),
        relation: tail.replace(/^\(/, "").replace(/\)$/, "").trim() || null,
      });
    }
  }

  const aka = html.match(/mdl-aka-titles">([\s\S]*?)<\/span>/)?.[1];
  const tagsLi = html.match(/<b class="inline">Tags:<\/b>([\s\S]*?)<\/li>/)?.[1];
  const tags = tagsLi
    ? [...tagsLi.matchAll(/<a[^>]*>([^<]+)<\/a>/g)]
        .map((m) => decodeEntities(m[1]).trim())
        .filter((t) => !/vote or add tags/i.test(t))
    : [];

  const episodesRaw = detailFrom(text, "Episodes")?.match(/\d+/)?.[0];
  const airedRaw = detailFrom(text, "(?:Aired|Release Date)");
  let airedFrom: Date | null = null;
  let airedTo: Date | null = null;
  if (airedRaw) {
    const [fromPart, toPart] = airedRaw.split(/\s[-–]\s/);
    airedFrom = fromPart ? parseMdlDate(fromPart) : null;
    airedTo = toPart ? parseMdlDate(toPart) : airedFrom;
  }
  if (!airedFrom && ld.datePublished) airedFrom = parseMdlDate(ld.datePublished);

  return {
    url,
    title: decodeEntities(ld.name),
    nativeTitle: detailFrom(text, "Native Title"),
    alsoKnownAs: aka ? stripTags(aka).replace(/\s*,\s*/g, ", ") || null : null,
    synopsis,
    posterUrl: ld.image ?? null,
    genres: Array.isArray(ld.genre) ? ld.genre : [],
    tags,
    director: detailLinksText(html, "Director"),
    screenwriter: detailLinksText(html, "Screenwriter"),
    network: detailFrom(text, "Original Network"),
    episodes: episodesRaw ? Number(episodesRaw) : null,
    airedFrom,
    airedTo,
    airedOn: detailFrom(text, "Aired On"),
    duration: detailFrom(text, "Duration"),
    contentRating: detailFrom(text, "Content Rating"),
    year: airedFrom ? airedFrom.getFullYear() : null,
    status: deriveStatus(airedFrom, airedTo),
    rating: ld.aggregateRating?.ratingValue ?? null,
    related,
    cast: parseMdlDramaCast(html),
  };
}

/** Простой фетч страницы тайтла (без Cloudflare) — для админ-кнопки. */
export async function fetchMdlDrama(url: string): Promise<MdlDrama> {
  // Через общий fetchMdlHtml, как и страницы людей: голый fetch тут
  // ловил от Cloudflare 403, и импорт сериала падал там, где импорт
  // актёра проходил. Проверку хоста делает сам fetchMdlHtml.
  return parseMdlDramaPage(await fetchMdlHtml(url), url);
}

// ---------- каст со страницы сериала ----------

export type MdlCastMember = {
  /** «/people/12345-name» — тот же вид пути, что в фильмографии. */
  mdlPath: string;
  name: string;
  /** Имя персонажа, если указано. */
  role: string | null;
  /** «Main Role» / «Support Role» / «Guest Role». */
  roleType: string | null;
};

/**
 * Каст со страницы сериала. Разбор намеренно «по якорям», а не по
 * классам блоков: вёрстка карточек актёров у MDL меняется, а вот сама
 * ссылка на `/people/<id>-<slug>` и подпись роли («Main Role») —
 * стабильны годами. Берём каждую ссылку на человека и смотрим на
 * ближайшие ~600 символов после неё: там лежат имя персонажа и тип
 * роли.
 *
 * Область поиска сужаем до блока каста — иначе в список попали бы
 * режиссёр и сценарист, которые на странице тоже ссылки на /people/.
 */
export function parseMdlDramaCast(html: string): MdlCastMember[] {
  const castStart = html.search(/id="cast"|>\s*Cast\s*&|>\s*Cast\s*</i);
  const region = castStart >= 0 ? html.slice(castStart) : html;

  const out: MdlCastMember[] = [];
  const seen = new Set<string>();
  // Хвост берём просмотром вперёд (?=…), а не захватом: иначе матч
  // съедал бы 600 символов вместе со следующими актёрами, и в списке
  // оставался только каждый второй-третий.
  for (const m of region.matchAll(
    /<a[^>]+href="(\/people\/\d+[^"#?]*)"[^>]*>([^<]*)<\/a>(?=([\s\S]{0,600}))/g,
  )) {
    const mdlPath = m[1];
    const name = decodeEntities(m[2]).trim();
    // Ссылка-картинка: текста нет, имя придёт со следующей ссылкой.
    if (!name) continue;
    if (seen.has(mdlPath)) continue;
    seen.add(mdlPath);

    const tail = m[3];
    const roleType = tail.match(/(Main Role|Support Role|Guest Role)/)?.[1] ?? null;
    // Имя персонажа — первый <small> до подписи роли; у MDL оно там
    // и лежит, но если вёрстка другая, роль просто останется пустой.
    const roleRaw = tail.match(/<small[^>]*>([\s\S]*?)<\/small>/)?.[1];
    const role = roleRaw ? stripTags(decodeEntities(roleRaw)).trim() || null : null;

    out.push({
      mdlPath,
      name,
      role: role && !/Role$/.test(role) ? role : null,
      roleType,
    });
  }
  return out;
}

// ---------- человек ----------

export type MdlPersonFilmRow = {
  mdlPath: string; // "/801612-be-my-player-two"
  title: string;
  year: number | null;
  episodes: number | null;
  role: string | null;
  roleType: string | null; // "Main Role" | "Support Role" | …
};

export type MdlPerson = {
  url: string;
  name: string;
  firstName: string | null;
  familyName: string | null;
  alsoKnownAs: string | null;
  nationality: string | null;
  gender: string | null;
  born: Date | null;
  bio: string | null;
  photoUrl: string | null;
  socialLinks: string[];
  filmography: MdlPersonFilmRow[];
};

type JsonLdArticle = {
  "@type"?: string;
  description?: string;
  mainEntity?: {
    "@type"?: string;
    name?: string;
    image?: { url?: string };
    description?: string;
  };
};

const SOCIAL_EXCLUDE =
  /sharer|intent|My_Drama_List|MyDramaListdotcom|my\.drama\.list|@mydramalist|UCfnEmDUWC4m0k|mydramalist\.com/i;

/** Убирает служебную приписку «(Source: MyDramaList)» из текста —
 *  атрибуция самого MDL живёт у нас отдельной ссылкой в блоке
 *  «Источники». Указания на ДРУГИЕ источники (Netflix, GMMTV,
 *  Wikipedia…) остаются в тексте: это атрибуция чужих текстов. */
export function stripMdlSelfAttribution(text: string | null): string | null {
  if (!text) return text;
  const cleaned = text
    .replace(/\s*\(\s*Source:\s*MyDramaList\s*\)\s*/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || null;
}

export function parseMdlPersonPage(html: string, url: string): MdlPerson {
  let article: JsonLdArticle | null = null;
  for (const block of jsonLdBlocks(html)) {
    const b = block as JsonLdArticle;
    if (b.mainEntity?.["@type"] === "Person") {
      article = b;
      break;
    }
  }
  const name =
    article?.mainEntity?.name ??
    decodeEntities(html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? "");
  if (!name) throw new Error("Не удалось разобрать страницу человека");

  const text = pipeText(html);

  const bornRaw = detailFrom(text, "Born");
  // Био: в Article JSON-LD лежит полный текст с переносами.
  const bio = stripMdlSelfAttribution(
    article?.description ? decodeEntities(article.description).trim() : null,
  );

  // Персональные соцссылки (исключая share-кнопки и аккаунты самого MDL).
  const socialLinks: string[] = [];
  for (const m of html.matchAll(
    /href="(https?:\/\/(?:www\.)?(?:instagram\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|facebook\.com)\/[^"]+)"/g,
  )) {
    const link = decodeEntities(m[1]);
    if (SOCIAL_EXCLUDE.test(link)) continue;
    if (!socialLinks.includes(link)) socialLinks.push(link);
  }

  // Фильмография: строки tr.mdl-<id> из таблиц Drama/TV Show/Movie.
  const filmography: MdlPersonFilmRow[] = [];
  for (const row of html.matchAll(/<tr class="mdl-\d+">([\s\S]*?)<\/tr>/g)) {
    const r = row[1];
    const link = r.match(/<b><a[^>]*href="(\/[^"]+)"[^>]*>([^<]+)<\/a>/);
    if (!link) continue;
    const yearRaw = r.match(/<td class="year[^"]*">(\d{4})<\/td>/)?.[1];
    const epsRaw = r.match(/<td class="episodes[^"]*">(\d+)<\/td>/)?.[1];
    const roleName = r.match(/<div class="name">\s*([\s\S]*?)<\/div>/)?.[1];
    const roleType = r.match(/roleid">\s*([^<(][^<]*?)\s*<\/div>/)?.[1];
    filmography.push({
      mdlPath: link[1],
      title: decodeEntities(link[2]).trim(),
      year: yearRaw && yearRaw !== "0000" ? Number(yearRaw) : null,
      episodes: epsRaw ? Number(epsRaw) : null,
      role: roleName ? stripTags(roleName) || null : null,
      roleType: roleType ? decodeEntities(roleType).trim() || null : null,
    });
  }

  return {
    url,
    name: decodeEntities(name),
    firstName: detailFrom(text, "First Name"),
    familyName: detailFrom(text, "Family Name"),
    alsoKnownAs: detailFrom(text, "Also Known as"),
    nationality: detailFrom(text, "Nationality"),
    gender: detailFrom(text, "Gender"),
    born: bornRaw ? parseMdlDate(bornRaw) : null,
    bio,
    photoUrl: article?.mainEntity?.image?.url ?? null,
    socialLinks,
    filmography,
  };
}

const MDL_CHALLENGE = /Just a moment|challenges\.cloudflare\.com/i;

/**
 * Страница MyDramaList в обход Cloudflare.
 *
 * Обычный fetch на весь сайт отвечает 403 — челлендж решается только в
 * настоящем браузере. Порядок как у ficbook: сначала дешёвый fetch (по
 * cookies изредка проходит), затем chromium. Headless пробуем первым,
 * на сервере он может не пройти проверку — тогда импорт запускают с
 * локальной машины.
 */
async function fetchMdlHtml(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.hostname !== "mydramalist.com" && parsed.hostname !== "www.mydramalist.com") {
    throw new Error("Ожидается ссылка на mydramalist.com");
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": MDL_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      if (!MDL_CHALLENGE.test(html.slice(0, 3000))) return html;
    }
  } catch {
    // идём в браузер
  }

  const { chromium } = await import("playwright");
  let lastError = "";
  for (const headless of [true, false]) {
    const browser = await chromium.launch({ headless }).catch(() => null);
    if (!browser) continue;
    try {
      const page = await browser.newPage({ userAgent: MDL_UA });
      await page.goto(url, { waitUntil: "commit", timeout: 45000 });
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(2000);
        const title = await page.title().catch(() => "");
        if (!MDL_CHALLENGE.test(title)) break;
      }
      const html = await page.content();
      if (!MDL_CHALLENGE.test(html.slice(0, 3000))) return html;
      lastError = "Cloudflare-проверка не пройдена";
    } catch (e) {
      lastError = e instanceof Error ? e.message.split("\n")[0] : String(e);
    } finally {
      await browser.close();
    }
  }
  throw new Error(
    `MyDramaList не отдал страницу (${lastError || "Cloudflare"}) — попробуйте ещё раз`,
  );
}

export async function fetchMdlPerson(url: string): Promise<MdlPerson> {
  return parseMdlPersonPage(await fetchMdlHtml(url), url);
}

// ---------- поиск ----------

export type MdlSearchTitle = { path: string; title: string; year: number | null };
export type MdlSearchPerson = { path: string; name: string };

export function parseMdlSearchTitles(html: string): MdlSearchTitle[] {
  const out: MdlSearchTitle[] = [];
  // Карточка результата: <h6 class="text-primary title"><a href="/12345-slug">
  // Title</a> … затем "<span class="text-muted">Thai Drama - 2020, 13 episodes".
  for (const m of html.matchAll(
    /<h6 class="text-primary title"><a href="(\/\d+-[^"]+)">([^<]+)<\/a>([\s\S]{0,400}?)<span class="text-muted">([^<]*)</g,
  )) {
    const yearRaw = m[4].match(/\b(19|20)\d{2}\b/)?.[0];
    out.push({
      path: m[1],
      title: decodeEntities(m[2]).trim(),
      year: yearRaw ? Number(yearRaw) : null,
    });
  }
  return out;
}

export function parseMdlSearchPeople(html: string): MdlSearchPerson[] {
  const out: MdlSearchPerson[] = [];
  for (const m of html.matchAll(/<a href="(\/people\/\d+-[^"]+)"[^>]*>([^<]+)<\/a>/g)) {
    const name = decodeEntities(m[2]).trim();
    if (!name || out.some((p) => p.path === m[1])) continue;
    out.push({ path: m[1], name });
  }
  return out;
}

export function mdlSearchUrl(query: string): string {
  return `${MDL_ORIGIN}/search?q=${encodeURIComponent(query)}`;
}

/** Числовой id из пути/URL MDL ("/801612-be-my-player-two" → "801612"). */
export function mdlIdFromUrl(urlOrPath: string): string | null {
  return urlOrPath.match(/(?:^|\/)(\d+)-/)?.[1] ?? null;
}
