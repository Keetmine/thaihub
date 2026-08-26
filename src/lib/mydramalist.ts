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
  const raw = s.trim();
  // У анонсов дата часто известна только с точностью до года («2026»)
  // или месяца («Nov 2026») — new Date("2026") разобрал бы это как
  // 1 января по UTC, но «?» и прочий мусор надо отсечь.
  if (/^\d{4}$/.test(raw)) return new Date(Date.UTC(Number(raw), 0, 1));
  if (/^[?\s-–]*$/.test(raw)) return null;
  // Разбираем как UTC, а не в поясе сервера: «Nov 21, 2025» без этого
  // становится локальной полуночью, и на машине восточнее Гринвича
  // дата съезжала на день назад (в базе проекта время — «настенное»,
  // то есть UTC).
  const d = new Date(`${raw} UTC`);
  if (!Number.isNaN(d.getTime())) return d;
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
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

/**
 * Канонический адрес страницы MDL: всегда https, всегда без `www.`, без
 * query и якоря, без хвостового слэша. Нужен, потому что `Drama.mdlUrl`
 * уникально и служит ключом дедупликации: `…/12345-x`, `…/12345-x/`,
 * `www.…` и `…?ref=search` — одна и та же страница, но четыре разные
 * строки, и без нормализации на один сериал завелось бы четыре записи.
 */
export function canonicalMdlUrl(urlOrPath: string): string {
  const raw = urlOrPath.trim();
  // Ссылку часто вставляют без схемы («mydramalist.com/12345-x») —
  // absMdlUrl принял бы её за путь и приклеил к origin второй раз.
  const abs = /^https?:\/\//i.test(raw)
    ? raw
    : raw.startsWith("/")
      ? `${MDL_ORIGIN}${raw}`
      : `https://${raw}`;
  try {
    const u = new URL(abs);
    return `${MDL_ORIGIN}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return abs;
  }
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
  /** Сколько на странице ссылок на людей вообще — чтобы в журнале
   *  импорта отличать «вёрстка не совпала» от «каста в HTML нет». */
  peopleLinks: number;
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

  // «Episodes: 0» у анонсов означает «пока неизвестно», а не ноль.
  const episodesRaw = detailFrom(text, "Episodes")?.match(/\d+/)?.[0];
  const episodes = episodesRaw && Number(episodesRaw) > 0 ? Number(episodesRaw) : null;
  // Подпись строки с датами у MDL плавает: у вышедших «Aired», у
  // анонсов встречаются «Airs», «Air Date», «Release Date».
  const airedRaw = detailFrom(text, "(?:Aired|Airs|Air Date|Release Date)");
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
    episodes,
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
    peopleLinks: countMdlPeopleLinks(html),
  };
}

/** Страница тайтла для админ-кнопки.
 *
 *  По умолчанию через общий fetchMdlHtml, как и страницы людей: голый
 *  fetch тут ловил от Cloudflare 403, и импорт сериала падал там, где
 *  импорт актёра проходил. `browserFallback: false` — для массовых
 *  прогонов: там подъём chromium на каждую недоступную страницу
 *  недопустим. Проверку хоста делает сам fetch. */
export async function fetchMdlDrama(
  url: string,
  opts: { browserFallback?: boolean } = {},
): Promise<MdlDrama> {
  const html =
    opts.browserFallback === false ? await fetchMdlHtmlPlain(url) : await fetchMdlHtml(url);
  return parseMdlDramaPage(html, url);
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
  const castStart = html.search(/id="cast"|>\s*Cast\s*[&<]/i);
  const region = castStart >= 0 ? html.slice(castStart) : html;

  const out: MdlCastMember[] = [];
  const seen = new Set<string>();
  // Ссылка может быть и относительной, и абсолютной, а имя внутри неё
  // — обёрнуто в <b>/<span>. Поэтому href разбираем с необязательным
  // хостом, а текст ссылки берём как угодно размеченный и чистим от
  // тегов. Хвост — просмотром вперёд, иначе матч съедает следующих.
  for (const m of region.matchAll(
    /<a[^>]+href="(?:https?:\/\/(?:www\.)?mydramalist\.com)?(\/people\/\d+[^"#?]*)"[^>]*>([\s\S]*?)<\/a>(?=([\s\S]{0,600}))/g,
  )) {
    const mdlPath = m[1];
    const name = decodeEntities(stripTags(m[2])).replace(/\s+/g, " ").trim();
    // Ссылка-картинка: текста нет, имя придёт следующей ссылкой.
    if (!name) continue;
    if (seen.has(mdlPath)) continue;

    const tail = m[3];
    const roleMatch = tail.match(/(Main Role|Support Role|Guest Role)/);
    // Без подписи роли это не карточка актёра, а ссылка на человека в
    // другом блоке (режиссёр, сценарист, «похожие люди»).
    if (!roleMatch) continue;
    seen.add(mdlPath);

    // Имя персонажа — то, что стоит между ссылкой и подписью роли.
    const between = decodeEntities(stripTags(tail.slice(0, roleMatch.index ?? 0)))
      .replace(/\s+/g, " ")
      .trim();
    const role = between && between.length <= 80 ? between : null;

    out.push({ mdlPath, name, role, roleType: roleMatch[1] });
  }
  return out;
}

/** Диагностика для журнала импортов: сколько на странице ссылок на
 *  людей вообще. Ноль означает, что каста в отданном HTML нет (MDL
 *  прислал урезанную страницу), а не что не совпала вёрстка. */
export function countMdlPeopleLinks(html: string): number {
  return [...html.matchAll(/href="(?:https?:\/\/(?:www\.)?mydramalist\.com)?\/people\/\d+/g)].length;
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

const MDL_BLOCKED_MESSAGE =
  "MyDramaList закрыл доступ Cloudflare-проверкой — попробуйте позже " +
  "или запустите импорт с машины, которую MDL пропускает";

/** Ошибка запроса к MDL с кодом ответа. Код нужен вызывающему: обход
 *  страниц поиска по 404 понимает «страницы кончились», а не «сломалось». */
export class MdlHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MdlHttpError";
  }
}

function assertMdlUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.hostname !== "mydramalist.com" && parsed.hostname !== "www.mydramalist.com") {
    throw new Error("Ожидается ссылка на mydramalist.com");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Страница MDL обычным GET'ом с браузерным UA — и только им, без
 * подъёма chromium.
 *
 * Отдельно от `fetchMdlHtml` ради массовых прогонов: там на каждую
 * недоступную страницу заводить браузер нельзя — сотня таких попыток
 * растянула бы импорт на часы. Массовому импорту честнее упасть с
 * понятным сообщением.
 *
 * 429 — не отказ, а просьба притормозить: ждём столько, сколько
 * попросили в Retry-After (или полминуты), и повторяем.
 */
export async function fetchMdlHtmlPlain(
  url: string,
  opts: { attempts?: number; onWait?: (message: string) => void } = {},
): Promise<string> {
  assertMdlUrl(url);
  const attempts = opts.attempts ?? 3;
  let lastError: Error = new Error("MyDramaList не отдал страницу");

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": MDL_UA, "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      lastError = new Error(
        `не удалось открыть страницу MyDramaList (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`,
      );
      if (attempt === attempts) break;
      await sleep(3000 * attempt);
      continue;
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 30000 * attempt;
      lastError = new MdlHttpError(429, "MyDramaList ограничил частоту запросов (429)");
      if (attempt === attempts) break;
      opts.onWait?.(`MyDramaList просит подождать ${Math.round(wait / 1000)} с`);
      await sleep(Math.min(wait, 120000));
      continue;
    }

    if (!res.ok) {
      // 403 у MDL — это не «нет прав», а Cloudflare-заглушка: сообщение
      // должно вести к делу, а не к разбору кода ответа.
      lastError = new MdlHttpError(
        res.status,
        res.status === 403 ? MDL_BLOCKED_MESSAGE : `MyDramaList ответил ${res.status}`,
      );
      break;
    }

    const html = await res.text();
    if (MDL_CHALLENGE.test(html.slice(0, 3000))) {
      lastError = new MdlHttpError(403, MDL_BLOCKED_MESSAGE);
      break;
    }
    return html;
  }

  throw lastError;
}

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
  assertMdlUrl(url);

  try {
    // Одна повторная попытка: смысл здесь дешёвый — если не вышло,
    // дальше всё равно ждёт браузер.
    return await fetchMdlHtmlPlain(url, { attempts: 2 });
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

/**
 * Карточки результатов со страницы поиска (и обычного `?q=`, и
 * расширенного `?adv=titles&th=…`) — вёрстка у них одна.
 *
 * Карточка: `<h6 class="text-primary title"><a href="/12345-slug">Title</a>`,
 * ниже `<span class="text-muted">Thai Drama - 2020, 13 episodes</span>`.
 * Заголовок ищем по точному классу `text-primary title`: по одному
 * лишь `title` в матч попали бы боковые блоки («Top Airing»), где
 * ссылки на тайтлы такие же.
 *
 * Год необязателен. Раньше карточка без `text-muted` в пределах
 * 400 символов молча выпадала из выдачи — на обходе пагинации это
 * значит «потеряли сериал», а не «потеряли год». Хвост берём
 * просмотром вперёд `(?=…)`, а не захватом: захват съедал бы следующую
 * карточку, и в списке оставалась каждая вторая.
 */
export function parseMdlSearchTitles(html: string): MdlSearchTitle[] {
  const out: MdlSearchTitle[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(
    /<h6 class="text-primary title">\s*<a[^>]*href="(?:https?:\/\/(?:www\.)?mydramalist\.com)?(\/\d+-[^"#?]*)"[^>]*>([\s\S]*?)<\/a>(?=([\s\S]{0,600}))/g,
  )) {
    const path = m[1];
    if (seen.has(path)) continue;
    const title = decodeEntities(stripTags(m[2])).replace(/\s+/g, " ").trim();
    if (!title) continue;
    seen.add(path);
    const meta = m[3].match(/<span class="text-muted">([^<]*)</)?.[1] ?? "";
    const yearRaw = meta.match(/\b(19|20)\d{2}\b/)?.[0];
    out.push({ path, title, year: yearRaw ? Number(yearRaw) : null });
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
