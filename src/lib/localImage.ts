import { access, mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

// Same allowlist as the manual admin upload endpoint (src/app/api/upload/
// route.ts) — no image/svg+xml, which can carry an executable <script>
// and would be served back verbatim as a static file from /public/uploads.
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const WEBP_QUALITY = 82;

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
 */
export async function downloadRemoteImage(url: string | null, folder: string): Promise<string | null> {
  if (!url) return null;

  let remoteName: string;
  try {
    remoteName = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return url;
  }
  if (!remoteName) return url;

  const base = remoteName.replace(/\.[a-zA-Z0-9]+$/, "");
  const dir = path.join(UPLOADS_ROOT, folder);

  // Проверяем обе возможные локальные версии: сконвертированную .webp и
  // (для гифок) исходное расширение.
  for (const name of [`${base}.webp`, remoteName]) {
    try {
      await access(path.join(dir, name));
      return `/uploads/${folder}/${name}`;
    } catch {
      // not on disk under this name — keep checking / fall through
    }
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new Error(`unexpected content-type "${contentType}"`);
    }

    const raw = Buffer.from(await res.arrayBuffer());
    const { buffer, ext } = await toWebp(raw, contentType);
    const filename = ext === ".webp" ? `${base}.webp` : remoteName;

    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer);
    return `/uploads/${folder}/${filename}`;
  } catch (err) {
    console.warn(`downloadRemoteImage: failed for ${url} — ${err instanceof Error ? err.message : err}`);
    return url;
  }
}
