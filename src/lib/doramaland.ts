/**
 * Разбор страницы сериала на dorama.land — русские названия для нашего
 * каталога (задел под Ж4б: сейчас русская версия сайта показывает
 * английские названия, потому что русских у нас просто нет).
 *
 * Сайт отдаётся обычным GET без защиты и размечен микроданными
 * schema.org, поэтому разбор держится за itemprop-атрибуты и подписи
 * полей, а не за вёрстку.
 *
 * Берём названия и русское описание (решение владельца): русская
 * версия сайта должна показывать русские название и сюжет, а другого
 * источника русских текстов у нас нет.
 *
 * Сведение с нашей записью — по английскому названию из
 * alternativeHeadline или «Оригинальному» плюс год: русское название
 * для поиска соответствия бесполезно, его-то у нас и нет.
 */

export type DoramaLandPage = {
  /** Русское название с карточки, без хвоста «сериал с 2026 г.». */
  titleRu: string | null;
  /** Прочие варианты названия (укр/англ/оригинал), как перечислены. */
  altTitles: string[];
  /** Поле «Оригинальное:» — у тайских сериалов там латиница. */
  original: string | null;
  year: number | null;
  country: string | null;
  /** Русские жанры («Драма, Романтика, Яой / BL / Сёнэн-ай»). */
  genresRu: string[];
  episodes: number | null;
  /** Русское описание — абзацы через пустую строку. */
  descriptionRu: string | null;
  sourceUrl: string;
};

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Значение поля из списка характеристик по русской подписи. */
function fieldAfter(html: string, label: string): string | null {
  const m = html.match(new RegExp(`${label}\\s*:?\\s*</[^>]+>([\\s\\S]{0,400}?)</li>`, "i"));
  if (!m) return null;
  const value = text(m[1]);
  return value || null;
}

export function parseDoramaLandPage(html: string, sourceUrl: string): DoramaLandPage {
  // Заголовок карточки: «Узел сериал с 2026 г.» — название без
  // служебного хвоста, год из хвоста. h1 не годится: он сеошный
  // («Узел лакорн 2026 смотреть онлайн русская озвучка»). Сущности
  // обязательно разобрать ДО среза: в разметке стоит «&nbsp;», и \s его
  // не видит — хвост оставался в названии.
  const cardTitleRaw = html.match(/about-serial-header__title[^>]*>([^<]+)/)?.[1] ?? null;
  const cardTitle = cardTitleRaw ? text(cardTitleRaw) : null;
  let titleRu: string | null = null;
  let year: number | null = null;
  if (cardTitle) {
    year = Number(cardTitle.match(/(19|20)\d{2}/)?.[0]) || null;
    titleRu = cardTitle
      // приставки: «Веб-дорама Жемчужина…», «Дорама …»
      .replace(/^(?:веб-)?дорама\s+/iu, "")
      // хвосты: «… сериал с 2026 г.», «… фильм 2024», «… вертикальная
      // дорама», «… лакорн 2026». «N сезон» — не хвост, а часть
      // названия. Без \b: в JS он видит только латиницу, и после
      // кириллического слова границы «нет» — срез молча не работал.
      .replace(/\s+(?:вертикальная\s+)?(?:сериал|фильм|лакорн|дорама)(?:\s.*)?$/iu, "")
      .trim() || null;
  }

  const altRaw = html.match(/itemprop="alternativeHeadline"[^>]*>([^<]+)/)?.[1] ?? "";
  const altTitles = altRaw
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  const original = fieldAfter(html, "Оригинальное");
  const country = fieldAfter(html, "Страна");
  const genresRaw = html.match(/itemprop="genre"[^>]*>([^<]+)/)?.[1] ?? "";
  const genresRu = genresRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const episodesRaw = fieldAfter(html, "Количество серий");
  const episodes = episodesRaw ? Number.parseInt(episodesRaw, 10) || null : null;

  // Описание: контейнер itemprop="description", абзацы <p> отдельно —
  // склейка через пустую строку сохраняет их и после чистки тегов.
  let descriptionRu: string | null = null;
  const descStart = html.indexOf('itemprop="description"');
  if (descStart >= 0) {
    const tail = html.slice(descStart, descStart + 20000);
    const container = tail.slice(tail.indexOf(">") + 1, tail.search(/<\/div>/i));
    const paragraphs = [...container.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => text(m[1]))
      .filter(Boolean);
    descriptionRu = paragraphs.length ? paragraphs.join("\n\n") : text(container) || null;
  }

  return { titleRu, altTitles, original, year, country, genresRu, episodes, descriptionRu, sourceUrl };
}

/**
 * Кандидаты для поиска нашей записи: английские/латинские варианты
 * названия. Кириллицу отбрасываем — в нашей базе её нет.
 */
export function doramaLandMatchTitles(page: DoramaLandPage): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of [...page.altTitles, page.original ?? ""]) {
    const value = candidate.trim();
    if (!value || /[а-яё]/i.test(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36";

// Дедлайн на каждый запрос: у fetch в Node своего нет, и зависший сокет
// держал бы массовый прогон бесконечно.
const FETCH_TIMEOUT_MS = 15000;

/** fetch с таймаутом и внятной ошибкой (какой url не открылся). */
async function fetchDoramaLand(url: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ru" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(
      `dorama.land: не открылось ${url} (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`,
    );
  }
}

export async function fetchDoramaLandPage(url: string): Promise<DoramaLandPage> {
  const res = await fetchDoramaLand(url);
  if (!res.ok) throw new Error(`dorama.land: HTTP ${res.status} на ${url}`);
  return parseDoramaLandPage(await res.text(), url);
}

/**
 * Все страницы СЕРИАЛОВ из их sitemap-ов. Страницы серий («…-N-seriya»)
 * и тегов отсеиваются; порядок — как в карте.
 */
export async function collectDoramaLandSeriesUrls(): Promise<string[]> {
  // res.ok проверяем обязательно: страница ошибки (500/503) молча
  // парсилась бы как пустой XML — «нет сериалов» вместо «сайт лежит».
  const indexRes = await fetchDoramaLand("https://dorama.land/sitemap.xml");
  if (!indexRes.ok) throw new Error(`dorama.land: sitemap.xml -> HTTP ${indexRes.status}`);
  const index = await indexRes.text();
  const maps = [...index.matchAll(/<loc>(https:\/\/dorama\.land\/sitemap_\d+\.xml)<\/loc>/g)].map(
    (m) => m[1],
  );
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const map of maps) {
    const mapRes = await fetchDoramaLand(map);
    if (!mapRes.ok) throw new Error(`dorama.land: ${map} -> HTTP ${mapRes.status}`);
    const xml = await mapRes.text();
    for (const m of xml.matchAll(/<loc>(https:\/\/dorama\.land\/[^<]+)<\/loc>/g)) {
      const url = m[1];
      if (url.includes("/tags/")) continue;
      if (/-\d+-seriya$/.test(url)) continue;
      if (/\/(?:all-new-dramas|sitemap)/.test(url) || url === "https://dorama.land/") continue;
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

/**
 * Тот ли это профиль сериалов, что нужен владельцу для «добавить
 * недостающее»: Таиланд — целиком, другие страны — только если в
 * жанрах есть яой/BL. Их «Яой / BL / Сёнэн-ай» — ОДНО значение со
 * слэшами, поэтому ищем по подстроке, а не по точному жанру.
 */
export function isWantedForImport(page: DoramaLandPage): boolean {
  if (page.country?.trim() === "Таиланд") return true;
  return page.genresRu.some((g) => /яой|\bbl\b|сёнэн-ай/i.test(g));
}

/**
 * Слить варианты названий в `alsoKnownAs` (владелец: «подтянуть все
 * возможные названия, абсолютно все, на всех языках»).
 *
 * Поиск по сайту читает alsoKnownAs через contains — положив сюда
 * русское и украинское названия, мы делаем сериал находимым по ним
 * везде сразу, без отдельного поля под каждый язык. Повторы и то, что
 * уже стоит в title/nativeTitle, отсеиваются без учёта регистра.
 */
export function mergeTitleVariants(
  existing: string | null,
  incoming: string[],
  skip: (string | null | undefined)[],
): string | null {
  const seen = new Set(
    skip.filter((v): v is string => !!v).map((v) => v.trim().toLowerCase()),
  );
  const out: string[] = [];
  for (const raw of [...(existing ?? "").split(","), ...incoming]) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.length ? out.join(", ") : null;
}