/**
 * Разбор страниц a-ara.co.jp — японского промоутера, который возит
 * тайских (и не только) артистов на фанмиты, фансайны и концерты в
 * Токио и Осаку. Сайт нашла владелец 2026-09-25.
 *
 * Чем он ценен: из 74 карточек на момент разведки в нашем каталоге
 * нашлись 2. Японская сцена не видна ни тайским билетным сайтам, ни
 * thaistarx — а туда ездят Fort/Peat, Up/Poom, Boss/Noeul, GEN1 и
 * остальные.
 *
 * Здесь только ЧИСТЫЙ разбор, без БД и без решений: краулер и очередь
 * черновиков — в `aaraCrawl.ts` (так же разведены thaiStarX.ts и
 * thaiStarXCrawl.ts).
 *
 * Разметка простая: WordPress, список — `<dl class="company">`,
 * страница события — таблица `table_style`, где в `<th>` стоит подпись
 * поля («日時» — когда, «会場» — где, «出演» — кто, «内容» — что), а в
 * `<td>` значение. Поэтому парсер читает поля ПО ПОДПИСИ, а не по
 * порядку строк: у части страниц строки идут в другом порядке (у
 * ME MIND Y «会場» стоит выше «出演»).
 */

/** Дата и время на страницах набраны и обычными цифрами, и
 *  полноширинными («１７：４５»), а скобки бывают и `(土)`, и `（金）».
 *  Приводим к одному виду до всякого разбора. */
function normalizeWidth(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ":")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/　/g, " ");
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Текст ячейки: без тегов, без сущностей, пробелы схлопнуты. */
function cellText(html: string): string {
  return normalizeWidth(decodeEntities(stripTags(html))).replace(/\s+/g, " ").trim();
}

export const AARA_LISTING_URL = "https://www.a-ara.co.jp/event/";
export const AARA_ARCHIVE_URL = "https://www.a-ara.co.jp/past_events/";

export type AaraListingKind = "recent" | "archive";

/** Адрес страницы списка. Первая — без `/page/N/`: WordPress отдаёт по
 *  этому адресу 404, а не первую страницу. */
export function aaraListingPageUrl(kind: AaraListingKind, page = 1): string {
  const base = kind === "archive" ? AARA_ARCHIVE_URL : AARA_LISTING_URL;
  return page <= 1 ? base : `${base}page/${page}/`;
}

/** Карточка в списке. `postedAt` — дата ПУБЛИКАЦИИ анонса, а не дата
 *  события: в списке её и показывают («2026.09.16»), а когда событие —
 *  написано только на его странице. */
export type AaraCard = { url: string; title: string; postedAt: string | null };

export function canonicalAaraUrl(href: string): string | null {
  const m = href.match(/^https?:\/\/(?:www\.)?a-ara\.co\.jp(\/[^?#]*)/i);
  if (!m) return null;
  const path = m[1].replace(/\/+$/, "");
  // Служебные адреса WordPress событием не являются.
  if (!/^\/(event|past_events)\/[^/]+$/.test(path)) return null;
  if (/\/(feed|page)$/.test(path)) return null;
  return `https://www.a-ara.co.jp${path}/`;
}

/** Список событий: по `<dl class="company">` на карточку. */
export function parseAaraListing(html: string): AaraCard[] {
  const cards: AaraCard[] = [];
  const seen = new Set<string>();
  // Без флага `s`: цель сборки его не берёт, поэтому «любой символ» —
  // явным [\s\S].
  const re =
    /<dl[^>]*class="[^"]*company[^"]*"[^>]*>\s*<dt>([\s\S]*?)<\/dt>\s*<dd>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const url = canonicalAaraUrl(m[2]);
    if (!url || seen.has(url)) continue;
    const title = cellText(m[3]);
    if (!title) continue;
    seen.add(url);
    const posted = cellText(m[1]).match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    cards.push({
      url,
      title,
      postedAt: posted
        ? `${posted[1]}-${posted[2].padStart(2, "0")}-${posted[3].padStart(2, "0")}`
        : null,
    });
  }
  return cards;
}

/** Все даты из строки «日時»: «2026年12月20日(日)» → «2026-12-20».
 *  Их бывает несколько — двухдневные гастроли идут одной карточкой. */
export function parseAaraDates(text: string): string[] {
  const out: string[] = [];
  for (const m of normalizeWidth(text).matchAll(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/g)) {
    const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    if (!out.includes(iso)) out.push(iso);
  }
  return out;
}

/**
 * Время НАЧАЛА из строки «日時». В одном дне бывает два сеанса
 * («1回目 … 開演 / 2回目 … 開演»), у фансайнов — «12:00スタート».
 *
 * Берём именно 開演 (начало представления), а не 開場 (открытие
 * дверей): на афише у нас стоит время начала, и «13:15» вместо «14:00»
 * было бы враньём. Если 開演 нет вовсе — идут «スタート», в последнюю
 * очередь 開場: лучше время открытия дверей, чем пустое поле.
 */
export function parseAaraShowTimes(text: string): string[] {
  const t = normalizeWidth(text);
  const pick = (marker: string): string[] => {
    const out: string[] = [];
    // Подпись стоит и после времени («14:00 開演»), и перед ним
    // («開演18:30») — ловим оба порядка.
    const re = new RegExp(`(?:(\\d{1,2}):(\\d{2})\\s*${marker}|${marker}\\s*(\\d{1,2}):(\\d{2}))`, "g");
    for (const m of t.matchAll(re)) {
      const h = m[1] ?? m[3];
      const min = m[2] ?? m[4];
      const time = `${h.padStart(2, "0")}:${min}`;
      if (!out.includes(time)) out.push(time);
    }
    return out;
  };
  const start = pick("開演");
  if (start.length > 0) return start;
  const fansign = pick("スタート");
  if (fansign.length > 0) return fansign;
  return pick("開場");
}

/** Заголовок вида «【Benefit】UP POOM …» — допродажа к основному
 *  событию. Отделяем пометку от названия: по названию без неё карточка
 *  склеивается с основной. */
export function splitAaraTitle(title: string): { variant: string | null; base: string } {
  const m = title.match(/^\s*【([^】]+)】\s*(.*)$/);
  return m ? { variant: m[1].trim(), base: m[2].trim() } : { variant: null, base: title.trim() };
}

/**
 * Строка «出演» → список имён.
 *
 * Это СПИСОК, а не проза: «UP / POOM», «GEN1 (ZEE/MAX/MARK/POPPY)»,
 * «BOSS×NOEUL». Поиск знакомых имён внутри строки, как в свободном
 * тексте, на коротких никах не срабатывает («BUILD», «NET», «ZEE» —
 * такие слова осторожный матчер по прозе не берёт, и правильно
 * делает). Поэтому строку режем по разделителям и сверяем каждый
 * кусок с каталогом точно.
 *
 * По пробелам НЕ режем: «Sam Lin» — одно имя. Списки через пробел
 * («BOSS NOEUL FORT PEAT SUNNY …») достаются вторым способом — поиском
 * по прозе, он как раз для них.
 */
export function splitAaraLineup(text: string | null): string[] {
  if (!text) return [];
  return normalizeWidth(text)
    .replace(/【[^】]*】/g, " ")
    // ・ разделяет и японские имена («リン・ズーホン»), но такие имена в
    // нашем каталоге всё равно не ищутся — разрезать их не вредно.
    .split(/[/／、，,&＋+×・()]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !/^\d+$/.test(s));
}

/** Один сеанс: день плюс время начала, если оно на странице есть. */
export type AaraSlot = { date: string; time: string | null };

/**
 * Даты и времена → расписание сеансов.
 *
 * Разложить одно по другому нельзя однозначно: «2 даты и 2 времени» —
 * это и «два сеанса в первый день», и «по сеансу в каждый». Решаем по
 * пометке «1回目 / 2回目» («первый показ / второй показ»), которой сайт
 * размечает именно сеансы ОДНОГО дня:
 *
 *  - один день — все времена относятся к нему;
 *  - есть «回目» — времена это сеансы каждого дня (у двухдневных
 *    гастролей расписание дня одинаковое);
 *  - времён столько же, сколько дней — по одному на день, по порядку;
 *  - одно время на несколько дней — оно же каждый день;
 *  - всё остальное — раскладку не выдумываем: первый сеанс ставим
 *    первому дню, остальные дни идут без времени, а карточка помечается
 *    неясной (см. `AaraEvent.reviewNotes`).
 */
export function buildAaraSchedule(
  dates: string[],
  times: string[],
  whenText: string,
): { slots: AaraSlot[]; ambiguous: boolean } {
  if (dates.length === 0) return { slots: [], ambiguous: false };
  if (times.length === 0) {
    return { slots: dates.map((date) => ({ date, time: null })), ambiguous: false };
  }
  if (dates.length === 1) {
    return { slots: times.map((time) => ({ date: dates[0], time })), ambiguous: false };
  }
  if (/回目/.test(normalizeWidth(whenText)) || times.length === 1) {
    const slots = dates.flatMap((date) => times.map((time) => ({ date, time })));
    return { slots, ambiguous: false };
  }
  if (times.length === dates.length) {
    return { slots: dates.map((date, i) => ({ date, time: times[i] })), ambiguous: false };
  }
  return {
    slots: dates.map((date, i) => ({ date, time: i === 0 ? times[0] : null })),
    ambiguous: true,
  };
}

export type AaraEvent = {
  sourceUrl: string;
  title: string;
  /** Название без пометки 【…】 — по нему ищется основная карточка. */
  baseTitle: string;
  variant: string | null;
  dates: string[];
  /** Время начала каждого сеанса дня; пусто — на странице его нет. */
  times: string[];
  /** Строка «日時» как есть — в черновик, чтобы владелец видел исходник
   *  рядом с тем, что из него вышло. */
  whenText: string | null;
  venue: string | null;
  /** Город из хвоста «豊洲PIT (東京)», если он там есть. */
  city: string | null;
  /** Строка «出演» как есть: разбирать её на людей — дело краулера,
   *  он сверяет имена с каталогом. */
  lineupText: string | null;
  /** «内容»: ファンミーティング / ライブ / サイン会. */
  kindText: string | null;
  priceText: string | null;
  ticketUrl: string | null;
  posterUrl: string | null;
  /** Сеансы: день + время начала (см. buildAaraSchedule). */
  slots: AaraSlot[];
  /**
   * Что в карточке разобрано неуверенно — краулер кладёт это в
   * черновик, чтобы владелец увидел при одобрении. Догадки лучше
   * помечать, чем прятать: гастроли по двум городам одной карточкой
   * («【大阪公演】… 【東京公演】…») парсер честно не разделит.
   */
  reviewNotes: string[];
  /**
   * Самостоятельное событие, а не допродажа. У карточек 【Benefit】,
   * 【VIP】, 【特典券】 таблицы с датой и местом НЕТ вовсе — по её
   * отсутствию их и отличаем, а не по пометке в заголовке: пометки
   * меняются от карточки к карточке, а таблица либо есть, либо нет.
   */
  standalone: boolean;
};

/** Строки таблицы «подпись → значение». */
function parseDetailTable(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const table = html.match(/<table[^>]*class="[^"]*table_style[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!table) return out;
  for (const row of table[1].matchAll(/<tr[^>]*>([\s\S]*?)(?=<\/tr>|<tr[^>]*>|$)/gi)) {
    const th = row[1].match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    if (!th) continue;
    const label = cellText(th[1]);
    if (!label || out.has(label)) continue;
    const td = row[1].match(/<td[^>]*>([\s\S]*?)$/i);
    if (!td) continue;
    out.set(label, cellText(td[1]));
  }
  return out;
}

export function parseAaraEvent(html: string, sourceUrl: string): AaraEvent {
  const titleRaw = html.match(/<h3[^>]*data-id="\d+"[^>]*>([\s\S]*?)<\/h3>/i);
  const title = titleRaw ? cellText(titleRaw[1]) : "";
  const { variant, base } = splitAaraTitle(title);
  const table = parseDetailTable(html);

  const when = table.get("日時") ?? "";
  const dates = parseAaraDates(when);
  const venueRaw = table.get("会場") ?? null;
  // «品川ザ・グランドホール(東京)» — город в хвосте в скобках.
  const cityMatch = venueRaw?.match(/^(.*?)\s*\(([^)]{1,12})\)\s*$/);

  const times = parseAaraShowTimes(when);
  const { slots, ambiguous } = buildAaraSchedule(dates, times, when);
  const reviewNotes: string[] = [];
  if (ambiguous) reviewNotes.push("даты и сеансы не раскладываются однозначно");
  // Гастроли по нескольким городам идут одной карточкой, и в ячейке
  // места стоят обе площадки: «【大阪公演】… 【東京公演】…». Развести
  // их по датам парсер не берётся — это работа владельца при одобрении.
  if (venueRaw && /【[^】]*】[\s\S]*【[^】]*】/.test(venueRaw)) {
    reviewNotes.push("в карточке несколько площадок — проверьте, одно ли это событие");
  }
  if (dates.length > 0 && times.length === 0) reviewNotes.push("на странице нет времени начала");

  const ticket = html.match(/<p[^>]*id="ticket_link"[\s\S]*?<a[^>]+href="([^"]+)"/i);
  // Постер — первая картинка, залитая в медиатеку сайта: темовые
  // картинки лежат в /themes/, их берём не глядя.
  const poster = html.match(/<img[^>]+src="(https:\/\/www\.a-ara\.co\.jp\/wp\/wp-content\/uploads\/[^"]+)"/i);

  return {
    sourceUrl,
    title,
    baseTitle: base,
    variant,
    dates,
    times,
    whenText: when || null,
    slots,
    reviewNotes,
    venue: cityMatch ? cityMatch[1].trim() : venueRaw,
    city: cityMatch ? cityMatch[2].trim() : null,
    lineupText: table.get("出演") ?? null,
    kindText: table.get("内容") ?? null,
    priceText: table.get("料金") ?? null,
    ticketUrl: ticket ? ticket[1] : null,
    posterUrl: poster ? poster[1] : null,
    standalone: dates.length > 0,
  };
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15000;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.8" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

export async function scrapeAaraListing(kind: AaraListingKind, page = 1): Promise<AaraCard[]> {
  return parseAaraListing(await fetchText(aaraListingPageUrl(kind, page)));
}

export async function scrapeAaraEvent(url: string): Promise<AaraEvent> {
  return parseAaraEvent(await fetchText(url), url);
}
