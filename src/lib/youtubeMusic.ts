// Парсер YouTube Music: дискография артиста со страницы канала.
//
// Браузер не нужен: страница отдаёт данные прямо в HTML, в блоках
// initialData.push({path:'/browse', data:'...'}). Это внутренний формат
// плеера, а не документированный API — ключи вроде
// musicTwoRowItemRenderer могут смениться без предупреждения, поэтому
// разбор написан «обходом дерева по ключу», а не жёсткими путями, и
// каждая ошибка видна в ImportRun, а не тонет.

export type YtmAlbum = {
  /** browseId вида MPREb_… — по нему собирается ссылка на альбом. */
  browseId: string;
  title: string;
  /** «Single», «Album», «EP» — как подписано на самой странице. */
  kind: string | null;
  year: number | null;
  coverUrl: string | null;
};

export type YtmSong = {
  videoId: string;
  title: string;
  plays: string | null;
};

export type YtmArtist = {
  channelId: string;
  name: string;
  subscribers: string | null;
  albums: YtmAlbum[];
  songs: YtmSong[];
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Канал из любой ссылки YouTube Music / YouTube: /channel/UC… */
export function parseChannelId(input: string): string | null {
  const m = input.match(/(?:channel\/)(UC[\w-]{20,})/);
  if (m) return m[1];
  return /^UC[\w-]{20,}$/.test(input.trim()) ? input.trim() : null;
}

/** Хендл канала из ссылки вида music.youtube.com/@FREEZEDROP или просто
 *  «@FREEZEDROP». Хендл — не id: чтобы импортировать, его надо сперва
 *  разменять на UC-идентификатор (см. resolveChannelHandle). */
export function parseChannelHandle(input: string): string | null {
  const raw = input.trim();
  const m = raw.match(/(?:youtube\.com\/|^)@([A-Za-z0-9._-]{2,})/i);
  return m ? m[1] : null;
}

/**
 * Хендл → id канала. У YouTube нет отдельного «дешёвого» эндпоинта, но
 * сама страница канала несёт id в разметке — забираем первый
 * «channelId»/«externalId» из неё. Запрашиваем youtube.com, а не
 * music.youtube.com: музыкальная версия отдаёт SPA-оболочку, в которой
 * идентификатора может не оказаться.
 */
export async function resolveChannelHandle(handle: string): Promise<string | null> {
  const clean = handle.replace(/^@/, "");
  const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(clean)}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m =
    html.match(/"(?:channelId|externalId)":"(UC[\w-]{20,})"/) ??
    html.match(/channel\/(UC[\w-]{20,})/);
  return m ? m[1] : null;
}

/** Ссылка на канал в любом виде → id. Хендл требует сетевого запроса,
 *  поэтому функция асинхронная; для готового id запрос не делается. */
export async function resolveChannelInput(input: string): Promise<string | null> {
  const direct = parseChannelId(input);
  if (direct) return direct;
  const handle = parseChannelHandle(input);
  return handle ? resolveChannelHandle(handle) : null;
}

export function channelUrl(channelId: string): string {
  return `https://music.youtube.com/channel/${channelId}`;
}

export function albumUrl(browseId: string): string {
  return `https://music.youtube.com/browse/${browseId}`;
}

export function songUrl(videoId: string): string {
  return `https://music.youtube.com/watch?v=${videoId}`;
}

/**
 * Снимает экранирование встроенных данных — то есть читает JS-строковый
 * литерал, внутри которого лежит JSON.
 *
 * YouTube кодирует непечатное как `\xNN`, и это БАЙТЫ UTF-8, а не
 * символы: тайские названия занимают по три байта каждый. Поэтому
 * собираем массив байтов и декодируем целиком, иначе на выходе
 * кракозябры вместо «ถอด (TAKE IT OFF)».
 *
 * Экранирование двухслойное, и слои легко перепутать. Кавычка внутри
 * JSON-строки приезжает как `\\` + `\x22`: первое — экранированный
 * бэкслеш JS-литерала, дающий один `\`, второе — сама кавычка. Вместе
 * получается `\"` — корректный JSON. Пока `\\` не обрабатывался,
 * оба бэкслеша доходили до выхода как есть, кавычка оставалась
 * неэкранированной и обрывала строку: биография LYKN с названием
 * сингла в кавычках роняла разбор всей страницы, а артисты без кавычек
 * в описании импортировались нормально.
 */
function decodeEmbedded(raw: string): string {
  const bytes: number[] = [];
  const pushChar = (ch: string) => {
    const code = ch.charCodeAt(0);
    if (code < 128) bytes.push(code);
    else bytes.push(...new TextEncoder().encode(ch));
  };

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "\\") {
      pushChar(raw[i]);
      continue;
    }
    const next = raw[i + 1];
    // Порядок важен: `\\` проверяется первым, иначе следующий за ним
    // escape прочитается как продолжение этого бэкслеша.
    if (next === "\\") {
      bytes.push(0x5c);
      i += 1;
    } else if (next === "x") {
      bytes.push(parseInt(raw.slice(i + 2, i + 4), 16));
      i += 3;
    } else if (next === "u") {
      pushChar(String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16)));
      i += 5;
    } else if (next === "/" || next === "'" || next === '"') {
      // Экранирование самого литерала: в JSON эти символы идут как есть.
      pushChar(next);
      i += 1;
    } else if (next === "n" || next === "r" || next === "t") {
      // Внутри JSON-строки перевод строки обязан остаться экранированным.
      bytes.push(0x5c, next.charCodeAt(0));
      i += 1;
    } else {
      pushChar(raw[i]);
    }
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

/** Все значения по ключу, где бы он ни лежал в дереве. */
function collect(node: unknown, key: string, acc: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    for (const v of node) collect(v, key, acc);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) acc.push(v);
      collect(v, key, acc);
    }
  }
  return acc;
}

/** Все строки под ключом "text" — подписи карточек лежат по-разному. */
function texts(node: unknown): string[] {
  return collect(node, "text").filter((t): t is string => typeof t === "string");
}

function firstString(node: unknown, key: string): string | null {
  const found = collect(node, key).find((v) => typeof v === "string");
  return (found as string) ?? null;
}

export async function fetchYtmArtist(channelId: string): Promise<YtmArtist> {
  const res = await fetch(channelUrl(channelId), {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!res.ok) throw new Error(`YouTube Music ответил ${res.status}`);
  const html = await res.text();

    // [\s\S] вместо флага s: цель компиляции ниже es2018.
  const match = html.match(
    /initialData\.push\(\{path:\s*'\\?\/browse'[\s\S]*?data:\s*'([\s\S]*?)'\}\)/,
  );
  if (!match) {
    throw new Error(
      "Не нашёл данные на странице — YouTube мог сменить формат или это не страница артиста",
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(decodeEmbedded(match[1]));
  } catch {
    throw new Error("Данные страницы не разобрались как JSON");
  }

  const header = (data as { header?: unknown }).header;
  const headerTexts = texts(header);
  const name = headerTexts[0]?.trim();
  if (!name) throw new Error("Не нашёл имя артиста");

  const albums: YtmAlbum[] = [];
  const seenAlbums = new Set<string>();
  for (const item of collect(data, "musicTwoRowItemRenderer")) {
    const browseId = firstString(item, "browseId");
    // MPREb_… — релиз; всё остальное (каналы, плейлисты) пропускаем.
    if (!browseId || !browseId.startsWith("MPREb") || seenAlbums.has(browseId)) continue;
    const title = texts((item as { title?: unknown }).title)[0]?.trim();
    if (!title) continue;
    const sub = texts((item as { subtitle?: unknown }).subtitle)
      .map((t) => t.trim())
      .filter((t) => t && t !== "•");
    const year = sub.map((t) => Number(t)).find((n) => Number.isInteger(n) && n > 1950) ?? null;
    const kind = sub.find((t) => /single|album|ep/i.test(t)) ?? null;
    seenAlbums.add(browseId);
    albums.push({
      browseId,
      title,
      kind,
      year,
      coverUrl: firstString(item, "url"),
    });
  }

  const songs: YtmSong[] = [];
  const seenSongs = new Set<string>();
  for (const item of collect(data, "musicResponsiveListItemRenderer")) {
    const videoId = firstString(item, "videoId");
    if (!videoId || seenSongs.has(videoId)) continue;
    const all = texts(item)
      .map((t) => t.trim())
      .filter(Boolean);
    const title = all[0];
    if (!title) continue;
    seenSongs.add(videoId);
    songs.push({
      videoId,
      title,
      plays: all.find((t) => /plays|прослуш/i.test(t)) ?? null,
    });
  }

  return {
    channelId,
    name,
    subscribers: headerTexts.find((t) => /^[\d.,]+[KM]?$/.test(t.trim())) ?? null,
    albums,
    songs,
  };
}
