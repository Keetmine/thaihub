/**
 * Разбор страницы сериала на dorama.land — русские названия для нашего
 * каталога (задел под Ж4б: сейчас русская версия сайта показывает
 * английские названия, потому что русских у нас просто нет).
 *
 * Сайт отдаётся обычным GET без защиты и размечен микроданными
 * schema.org, поэтому разбор держится за itemprop-атрибуты и подписи
 * полей, а не за вёрстку.
 *
 * Что берём и что нет — решение сознательное:
 * - названия (русское, украинское, английское, «оригинальное») — это
 *   факты, как год или страна;
 * - описание НЕ берём: это их авторский текст, у нас есть свой источник
 *   (MDL) и своя политика переводов.
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

  return { titleRu, altTitles, original, year, country, genresRu, episodes, sourceUrl };
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
