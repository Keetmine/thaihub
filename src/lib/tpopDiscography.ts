import { parseTpopPageTitle } from "@/lib/tpopFandom";

// Парсер секции ==Discography== статьи tpop.fandom.com (см.
// tpopFandom.ts про доступ через api.php). В отличие от остального
// импорта группы здесь удобнее сырой wikitext, а не отрендеренный HTML:
// строки дискографии — однотипные списки вида
//   *''[[Dusk & Dawn]]'' (2025)                        — альбом
//   *"[[May I? (LYKN)|May I?]]" (2023)                 — сингл
//   *"[[Charm (collaboration)|Charm]]" {{small|(with [[Joong]] &
//     [[Pond]])}} (2024)                               — с пояснением
// Пояснение из {{small|...}} сохраняется как note (для OST'ов в small
// лежит само название песни, а в кавычках — название OST — см. swap
// в parseDiscographyLine).

const UA = "MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";
const API_BASE = "https://tpop.fandom.com/api.php";

export type TpopAlbumEntry = {
  title: string;
  pageTitle: string | null; // заголовок вики-статьи альбома, если есть [[ссылка]]
  type: "ALBUM" | "EP";
  year: number | null;
};

export type TpopSongEntry = {
  title: string;
  pageTitle: string | null; // вики-статья песни, если строка была [[ссылкой]]
  note: string | null;
  year: number | null;
};

export type TpopDiscography = {
  pageTitle: string;
  albums: TpopAlbumEntry[];
  songs: TpopSongEntry[];
};

async function fetchWikitext(pageTitle: string): Promise<string> {
  const url = `${API_BASE}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`tpop.fandom.com ответил ${res.status}`);
  const data = (await res.json()) as {
    parse?: { wikitext?: { "*"?: string } };
    error?: { info?: string };
  };
  const wikitext = data.parse?.wikitext?.["*"];
  if (!wikitext) throw new Error(data.error?.info ?? "Пустой ответ api.php");
  return wikitext;
}

/** Главная картинка вики-статьи (обложка альбома) через prop=pageimages. */
export async function fetchTpopPageImage(pageTitle: string): Promise<string | null> {
  const url = `${API_BASE}?action=query&prop=pageimages&piprop=original&titles=${encodeURIComponent(pageTitle)}&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { original?: { source?: string } }> };
  };
  const pages = data.query?.pages ?? {};
  for (const page of Object.values(pages)) {
    if (page.original?.source) {
      // Викия отдаёт URL вида …/Имя.webp/revision/latest?cb=… — последний
      // сегмент пути у всех один («latest»), из-за чего downloadRemoteImage
      // сохранял бы каждую обложку под одним именем. Базовый URL без
      // /revision/ отдаёт тот же файл.
      return page.original.source.replace(/\/revision\/.*$/, "");
    }
  }
  return null;
}

/** "[[May I? (LYKN)|May I?]]" → {display: "May I?", page: "May I? (LYKN)"};
 *  голый текст возвращается как display без page. */
function parseWikiLink(raw: string): { display: string; page: string | null } {
  const m = raw.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (!m) return { display: raw.trim(), page: null };
  return { display: (m[2] ?? m[1]).trim(), page: m[1].trim() };
}

/** Убирает вики-разметку из произвольного фрагмента (для note). */
function stripWikiMarkup(raw: string): string {
  return raw
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDiscographyLine(
  line: string,
): { title: string; pageTitle: string | null; note: string | null; year: number | null } | null {
  let rest = line.replace(/^\*+\s*/, "").trim();
  if (!rest) return null;

  // Год — последняя скобка вида (2024) в конце строки (до <ref>).
  rest = rest.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "").replace(/<ref[^>]*\/>/g, "");
  const yearMatch = rest.match(/\((\d{4})\)\s*$/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  if (yearMatch) rest = rest.slice(0, yearMatch.index).trim();

  // Пояснение {{small|...}} / {{Small|...}}.
  let note: string | null = null;
  const smallMatch = rest.match(/\{\{[sS]mall\|([\s\S]*?)\}\}/);
  if (smallMatch) {
    note = stripWikiMarkup(smallMatch[1]).replace(/^\(/, "").replace(/\)$/, "").trim() || null;
    rest = (rest.slice(0, smallMatch.index) + rest.slice(smallMatch.index! + smallMatch[0].length)).trim();
  }

  const { display, page } = parseWikiLink(rest);
  let title = stripWikiMarkup(display).replace(/^["«]/, "").replace(/["»]$/, "").trim();
  if (!title) return null;

  // OST-строки: в кавычках — название OST, в small — сама песня
  // («"ThamePo … OST" {{small|("All I Need")}}») — меняем местами.
  if (note && /\bOST\b/i.test(title)) {
    const songName = note.replace(/^["«]/, "").replace(/["»]$/, "").trim();
    if (songName) {
      note = title;
      title = songName;
    }
  }

  return { title, pageTitle: page, note, year };
}

/** Секции уровня 3 внутри ==Discography==, с классификацией. */
function classifySection(heading: string): "ALBUM" | "EP" | "SONG" | null {
  const h = heading.toLowerCase();
  if (h.includes("album")) return "ALBUM";
  if (h.includes("ep")) return "EP";
  if (
    h.includes("single") ||
    h.includes("collaboration") ||
    h.includes("ost") ||
    h.includes("soundtrack") ||
    h.includes("song")
  ) {
    return "SONG";
  }
  return null;
}

export async function fetchTpopDiscography(pageTitleOrUrl: string): Promise<TpopDiscography> {
  const pageTitle = parseTpopPageTitle(pageTitleOrUrl);
  const wikitext = await fetchWikitext(pageTitle);

  // Секция ==Discography== до следующего заголовка второго уровня.
  const sectionMatch = wikitext.match(/^==\s*Discography\s*==\s*$([\s\S]*?)(?=^==[^=]|(?![\s\S]))/m);
  if (!sectionMatch) {
    throw new Error(`На странице «${pageTitle}» нет секции Discography`);
  }
  const section = sectionMatch[1];

  const albums: TpopAlbumEntry[] = [];
  const songs: TpopSongEntry[] = [];
  let currentKind: "ALBUM" | "EP" | "SONG" | null = null;

  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();
    const headingMatch = line.match(/^===\s*(.+?)\s*===$/);
    if (headingMatch) {
      currentKind = classifySection(headingMatch[1]);
      continue;
    }
    if (!currentKind || !line.startsWith("*")) continue;

    const parsed = parseDiscographyLine(line);
    if (!parsed) continue;

    if (currentKind === "ALBUM" || currentKind === "EP") {
      albums.push({
        title: parsed.title,
        pageTitle: parsed.pageTitle,
        type: currentKind,
        year: parsed.year,
      });
    } else {
      songs.push({ title: parsed.title, pageTitle: parsed.pageTitle, note: parsed.note, year: parsed.year });
    }
  }

  return { pageTitle, albums, songs };
}

/** Прямой URL файла викии по его имени («NuNew_Kata_promotional_image.png»). */
async function fetchTpopFileUrl(fileName: string): Promise<string | null> {
  const url = `${API_BASE}?action=query&titles=${encodeURIComponent(`File:${fileName}`)}&prop=imageinfo&iiprop=url&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { imageinfo?: { url?: string }[] }> };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  const src = page?.imageinfo?.[0]?.url ?? null;
  // Обрезаем /revision/... — иначе все файлы сохраняются под одним именем.
  return src ? src.replace(/\/revision\/.*$/, "") : null;
}

function normForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Фолбэк обложки: у многих синглов своей вики-страницы нет (красная
 *  ссылка), но промо-картинка лежит файлом в статье артиста —
 *  «NuNew_Kata_promotional_image_(4).png» подходит альбому «Kata». */
export async function fetchTpopAlbumImageFromArtistPage(
  artistPageTitle: string,
  albumTitle: string,
): Promise<string | null> {
  const url = `${API_BASE}?action=parse&page=${encodeURIComponent(artistPageTitle)}&prop=images&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = (await res.json()) as { parse?: { images?: string[] } };
  const files = (data.parse?.images ?? []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  const needle = normForMatch(albumTitle);
  if (needle.length < 3) return null;
  const hit = files.find((f) => normForMatch(f).includes(needle));
  return hit ? fetchTpopFileUrl(hit) : null;
}
