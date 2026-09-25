import { createHash } from "crypto";
import { access, mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { IMAGE_WIDTHS, variantName } from "@/lib/imageVariants";
import { fetchPublicUrl } from "@/lib/urlGuard";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

/**
 * Имя файла из ЧУЖОГО URL нельзя пускать в path.join как есть: после
 * decodeURIComponent из "%2e%2e%2f" вылезает "../", и writeFile уехал
 * бы за пределы public/uploads (вплоть до перезаписи кода). Поэтому:
 * только последний сегмент (basename), только безобидные символы,
 * без ведущих точек. Пустой остаток — значит имя было мусором.
 */
function sanitizeRemoteName(raw: string): string {
  const base = path.basename(raw);
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
}

/** Финальный пояс: собранный путь обязан остаться внутри root. Бросает,
 *  если санитизация выше каким-то образом не справилась. */
function resolveInside(root: string, ...segments: string[]): string {
  const full = path.resolve(root, ...segments);
  if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep)) {
    throw new Error(`path escapes uploads root: ${segments.join("/")}`);
  }
  return full;
}

// Same allowlist as the manual admin upload endpoint (src/app/api/upload/
// route.ts) — no image/svg+xml, which can carry an executable <script>
// and would be served back verbatim as a static file from /public/uploads.
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // musicfestival.in.th отдаёт часть фото и постеров в AVIF; sharp его
  // читает, на диск всё равно ложится WebP. Только для скачивания
  // импортами — в ручной upload (/api/upload) тип не добавлен.
  "image/avif",
]);

const WEBP_QUALITY = 82;



/**
 * Кладёт рядом с картинкой её уменьшенные копии.
 *
 * Копии делаем ТОЛЬКО вниз (`withoutEnlargement`): растянутый до 400
 * пикселей постер шириной 300 весил бы больше оригинала и выглядел бы
 * хуже. Не получилось — молча живём без копии: `srcset` тогда просто не
 * предложит её браузеру, а картинка останется на месте.
 */
export async function writeWebpVariants(
  dir: string,
  filename: string,
  buffer: Buffer,
): Promise<void> {
  if (!filename.endsWith(".webp")) return;
  for (const width of IMAGE_WIDTHS) {
    try {
      const resized = await sharp(buffer)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      // Копию пишем ВСЕГДА, даже если она не легче оригинала.
      //
      // Соблазн пропустить такую велик — толку от неё нет. Но `srcset`
      // обещает браузеру файл по имени, а не по выгоде: не найдя его,
      // браузер не возьмёт `src`, а покажет дыру. Лишний килобайт на
      // диске дешевле пропавшего постера.
      //
      // resolveInside: filename у вызывающих либо randomUUID, либо уже
      // санитизирован, но копия не должна уметь выйти из dir ни при
      // каком будущем вызове.
      await writeFile(resolveInside(dir, variantName(filename, width)), resized);
    } catch (err) {
      console.warn(`writeWebpVariants: ${filename} @${width} — ${err instanceof Error ? err.message : err}`);
    }
  }
}

/** Re-encodes an image buffer as WebP (smaller at the same visual
 *  quality than the JPEG/PNG sources it replaces). GIFs are kept as-is —
 *  the animated ones would need frame-aware handling for no real win. */
export async function toWebp(buffer: Buffer, contentType: string): Promise<{ buffer: Buffer; ext: string }> {
  if (contentType === "image/gif") return { buffer, ext: ".gif" };
  const converted = await sharp(buffer).webp({ quality: WEBP_QUALITY }).toBuffer();
  return { buffer: converted, ext: ".webp" };
}

/**
 * Downloads a remote image into public/uploads/{folder}/ (converted to
 * WebP) and returns its local /uploads/... URL, so an imported image
 * survives independently of whatever remote CDN it came from (see the
 * "Local image storage" section of docs/features/tmdb-import.md). Falls
 * back to the original remote URL on any failure — a broken image fetch
 * shouldn't sink the whole import — logging a warning either way so
 * failures stay visible without stopping a bulk sync.
 *
 * The local basename is the remote URL's own last path segment (TMDB's
 * image paths are already unique, content-addressed-looking ids), so a
 * second call for the same remote asset is a cheap fs.access check
 * instead of a re-download — safe to call on every sync, not just once.
 *
 * `opts.localBase` — своё имя файла (без расширения) вместо последнего
 * сегмента чужого URL. Нужно источникам, у которых имя картинки НЕ
 * уникально: на musicfestival.in.th постер каждого фестиваля лежит как
 * `/media/festivals/<слаг>/thumbnail.jpg`, и по умолчанию второй
 * фестиваль получил бы файл первого (проверка «уже на диске» — по
 * имени). Санитизируется так же, как чужое имя.
 */
/**
 * Как назовётся файл на нашем диске. `null` — адрес разобрать не вышло.
 *
 * **В имени есть отпечаток адреса**, и это не украшение. Ниже, в
 * `downloadRemoteImage`, стоит проверка «файл с таким именем уже на
 * диске — значит, та же картинка, скачивать не надо». Пока имя целиком
 * бралось из чужого адреса, проверка врала: у WordPress-афиш файл
 * называется по размеру («1050_486.jpg», «bnr_1050_486-1.jpg»), и одним
 * таким именем на a-ara.co.jp названы постеры ШЕСТИ разных событий.
 * Первое одобрение клало файл на диск, а все следующие получали чужую
 * картинку — и так до конца жизни файла (жалоба владельца 2026-09-25:
 * «одобрила несколько, все с кривой картинкой, и теперь новым событиям
 * тоже приходит неправильная»).
 *
 * Хвост из sha1 адреса чинит это для ВСЕХ источников разом: тот же
 * адрес даёт то же имя (повторно качать по-прежнему не нужно), разные
 * адреса — разные файлы. Прежний обход — своё имя через `localBase` у
 * каждого вызывающего — защищал только тех, кто о ловушке помнил.
 */
export function localImageName(
  url: string,
  opts: { localBase?: string } = {},
): { base: string; withExt: string } | null {
  let remoteName: string;
  try {
    // decode ДО санитизации: "%2e%2e%2f" разворачивается в "../" уже
    // после split по "/", и без sanitizeRemoteName ушёл бы в path.join.
    remoteName = sanitizeRemoteName(decodeURIComponent(new URL(url).pathname.split("/").pop() ?? ""));
  } catch {
    return null;
  }
  if (!remoteName) return null;

  const ext = remoteName.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
  let base = remoteName.replace(/\.[a-zA-Z0-9]+$/, "");
  if (opts.localBase) {
    const custom = sanitizeRemoteName(opts.localBase).replace(/\.[a-zA-Z0-9]+$/, "");
    if (custom) base = custom;
  }
  base = `${base}-${createHash("sha1").update(url).digest("hex").slice(0, 8)}`;
  return { base, withExt: `${base}${ext}` };
}

export async function downloadRemoteImage(
  url: string | null,
  folder: string,
  opts: { localBase?: string } = {},
): Promise<string | null> {
  if (!url) return null;

  const named = localImageName(url, opts);
  if (!named) return url;
  const { base, withExt: remoteName } = named;
  const dir = resolveInside(UPLOADS_ROOT, folder);

  // Проверяем обе возможные локальные версии: сконвертированную .webp и
  // (для гифок) исходное расширение.
  for (const name of [`${base}.webp`, remoteName]) {
    try {
      await access(resolveInside(dir, name));
      return `/uploads/${folder}/${name}`;
    } catch {
      // not on disk under this name — keep checking / fall through
    }
  }

  try {
    // fetchPublicUrl: адрес картинки приходит из чужого HTML (blscene,
    // фандом-вики, og:image) — без проверки это готовый SSRF в свою сеть.
    const res = await fetchPublicUrl(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new Error(`unexpected content-type "${contentType}"`);
    }

    const raw = Buffer.from(await res.arrayBuffer());
    const { buffer, ext } = await toWebp(raw, contentType);
    const filename = ext === ".webp" ? `${base}.webp` : remoteName;

    await mkdir(dir, { recursive: true });
    await writeFile(resolveInside(dir, filename), buffer);
    await writeWebpVariants(dir, filename, buffer);
    return `/uploads/${folder}/${filename}`;
  } catch (err) {
    console.warn(`downloadRemoteImage: failed for ${url} — ${err instanceof Error ? err.message : err}`);
    return url;
  }
}
