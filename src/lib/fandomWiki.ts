// Адреса вики Fandom — общие для всех наших парсеров фандома.
//
// Импорт начинался с одной вики (tpop.fandom.com, тайский поп), и хост
// был зашит константой в трёх модулях. Но у Fandom тысячи вики на
// поддоменах — thiphop.fandom.com про тайский хип-хоп, gmmtv.fandom.com
// и так далее, — а движок и вёрстка у всех ОДИНАКОВЫЕ: тот же
// MediaWiki с `action=parse` и та же portable-infobox (проверено на
// tpop.fandom.com/wiki/BUS и thiphop.fandom.com/wiki/1MILL: одинаковые
// pi-item / pi-data-label / pi-data-value / pi-image, разница только в
// наборе подписей). Поэтому хост теперь берётся из самой ссылки, и
// работает любая вики Fandom.
//
// Как и раньше, ходим в api.php: обычная страница отдаёт
// Cloudflare-проверку, а API отвечает чисто — это штатный путь доступа
// к MediaWiki, а не обход защиты.

/** Вики по умолчанию: с неё импорт начинался, и голое название статьи
 *  (без адреса) по-прежнему означает именно её. */
export const DEFAULT_FANDOM_HOST = "tpop.fandom.com";

export const FANDOM_UA = "MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";

/** Только поддомены fandom.com. Проверка нужна не для порядка, а против
 *  SSRF: адрес приходит из формы админки, и по нему мы ходим сами. */
const FANDOM_HOST_RE = /^[a-z0-9-]+\.fandom\.com$/i;

export type FandomTarget = { host: string; title: string };

/**
 * Разбирает то, что ввели в форму (или что пришло ссылкой со страницы
 * вики): полный адрес, относительный `/wiki/Название` или голое
 * название статьи.
 *
 * `fallbackHost` — для двух последних случаев: ссылки внутри статьи
 * относительные, и хост берётся у страницы, с которой мы их взяли.
 */
export function parseFandomTarget(
  input: string,
  fallbackHost: string = DEFAULT_FANDOM_HOST,
): FandomTarget {
  const trimmed = input.trim();

  let host = fallbackHost;
  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error("Не похоже на ссылку — проверьте адрес");
    }
    const hostname = parsed.hostname.replace(/^www\./i, "");
    if (!FANDOM_HOST_RE.test(hostname)) {
      throw new Error("Ожидается ссылка на вики Fandom (любой поддомен fandom.com)");
    }
    host = hostname.toLowerCase();
  }

  // Языковые вики живут по адресу вида /es/wiki/Название — префикс
  // отбрасываем вместе с остальным путём: он не часть названия статьи.
  const match = trimmed.match(/\/wiki\/([^?#]+)/);
  const raw = match ? match[1] : trimmed;
  // Названия вида «100%» — голый процент не декодируется (URI malformed).
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return { host, title: decoded.replace(/_/g, " ") };
}

/** Хост вики из адреса; для голого названия — вики по умолчанию. */
export function fandomHostOf(input: string, fallbackHost?: string): string {
  return parseFandomTarget(input, fallbackHost).host;
}

export function fandomApiBase(host: string = DEFAULT_FANDOM_HOST): string {
  if (!FANDOM_HOST_RE.test(host)) throw new Error(`Не вики Fandom: ${host}`);
  return `https://${host}/api.php`;
}

/** Адрес статьи — им подписываем источник в карточке. */
export function fandomPageUrl(host: string, title: string): string {
  return `https://${host}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}
