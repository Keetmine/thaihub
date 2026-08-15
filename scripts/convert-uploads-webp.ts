import "dotenv/config";
import { readdir, rename, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma";

/**
 * One-off sweep: converts every JPEG/PNG already sitting in
 * public/uploads/ (recursively) to WebP and repoints every DB image
 * field that referenced the old filename. New saves are WebP from the
 * start (src/lib/localImage.ts / /api/upload) — this catches up the
 * files written before that. GIFs and existing WebP files are left
 * alone. Safe to re-run: already-converted files simply aren't there
 * anymore. Run with:
 *   npx tsx scripts/convert-uploads-webp.ts
 */
const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");
const WEBP_QUALITY = 82;
const CONCURRENCY = 8;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function updateDbReferences(oldUrl: string, newUrl: string): Promise<number> {
  const [dramas, performers, agencies, events, locations, users] = await Promise.all([
    prisma.drama.updateMany({ where: { posterUrl: oldUrl }, data: { posterUrl: newUrl } }),
    prisma.performer.updateMany({ where: { photoUrl: oldUrl }, data: { photoUrl: newUrl } }),
    prisma.agency.updateMany({ where: { logoUrl: oldUrl }, data: { logoUrl: newUrl } }),
    prisma.event.updateMany({ where: { posterUrl: oldUrl }, data: { posterUrl: newUrl } }),
    prisma.location.updateMany({ where: { photoUrl: oldUrl }, data: { photoUrl: newUrl } }),
    prisma.user.updateMany({ where: { photoUrl: oldUrl }, data: { photoUrl: newUrl } }),
  ]);
  return (
    dramas.count + performers.count + agencies.count + events.count + locations.count + users.count
  );
}

async function main() {
  const startedAt = Date.now();
  const targets: string[] = [];
  for await (const file of walk(UPLOADS_ROOT)) {
    if (/\.(jpe?g|png)$/i.test(file)) targets.push(file);
  }
  console.log(`${targets.length} JPEG/PNG file(s) to convert`);

  let done = 0;
  let converted = 0;
  let failed = 0;
  let rowsUpdated = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  let next = 0;
  async function worker() {
    while (next < targets.length) {
      const file = targets[next++];
      const publicOld = "/" + path.relative(path.join(process.cwd(), "public"), file).split(path.sep).join("/");
      const webpPath = file.replace(/\.[a-zA-Z0-9]+$/, ".webp");
      const publicNew = "/" + path.relative(path.join(process.cwd(), "public"), webpPath).split(path.sep).join("/");
      try {
        const before = (await stat(file)).size;
        const buffer = await sharp(file).webp({ quality: WEBP_QUALITY }).toBuffer();
        // tmp + rename, чтобы никогда не отдать полузаписанный файл.
        await writeFile(webpPath + ".tmp", buffer);
        await rename(webpPath + ".tmp", webpPath);
        rowsUpdated += await updateDbReferences(publicOld, publicNew);
        await unlink(file);
        bytesBefore += before;
        bytesAfter += buffer.length;
        converted++;
      } catch (err) {
        failed++;
        console.warn(`failed: ${file} — ${err instanceof Error ? err.message : err}`);
      }
      done++;
      if (done % 500 === 0) console.log(`  ${done}/${targets.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  const mb = (n: number) => (n / 1024 / 1024).toFixed(0);
  console.log(`\n=== Done in ${elapsedMin} min ===`);
  console.log(`Converted: ${converted}, failed: ${failed}, DB rows updated: ${rowsUpdated}`);
  console.log(`Size: ${mb(bytesBefore)} MB -> ${mb(bytesAfter)} MB`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
