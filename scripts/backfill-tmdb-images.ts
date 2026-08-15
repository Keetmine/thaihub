import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { downloadRemoteImage } from "../src/lib/localImage";

/**
 * One-off backfill: every Drama.posterUrl / Performer.photoUrl /
 * Agency.logoUrl that still points at image.tmdb.org gets downloaded into
 * public/uploads/tmdb/ and the row repointed at the local /uploads/ URL —
 * new TMDB imports already do this on write (see downloadRemoteImage in
 * src/lib/localImage.ts), this just catches up everything imported
 * before that. Safe to re-run: rows already on a local URL are excluded
 * by the `startsWith` filter, and downloadRemoteImage itself skips a
 * re-download if the file's already on disk. Run with:
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/backfill-tmdb-images.ts
 * (the env flag makes Node's fetch honor HTTPS_PROXY — needed on
 * networks where TMDB's image CDN is DNS-blocked, see the "Proxy
 * caveat" note in docs/features/tmdb-import.md.)
 */
const CONCURRENCY = 6;
const TMDB_HOST = "https://image.tmdb.org/";
const RETRY_DELAYS_MS = [2_000, 15_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** TMDB's CDN throttles bursts (a full-catalog run is ~20k requests) —
 *  observed as instant mass "fetch failed" mid-run. A couple of spaced
 *  retries per image lets a run ride out a throttling window instead of
 *  marking thousands of rows failed. */
async function downloadWithRetry(url: string, folder: string): Promise<string | null> {
  for (const delay of RETRY_DELAYS_MS) {
    const local = await downloadRemoteImage(url, folder);
    if (local !== url) return local;
    await sleep(delay);
  }
  return downloadRemoteImage(url, folder);
}

async function processInPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runOne));
}

async function backfillField<T extends { id: string }>(
  label: string,
  rows: (T & { url: string })[],
  update: (id: string, localUrl: string) => Promise<unknown>,
): Promise<{ downloaded: number; failed: number }> {
  console.log(`${label}: ${rows.length} TMDB image(s) to download`);
  let done = 0;
  let downloaded = 0;
  let failed = 0;

  await processInPool(
    rows,
    async (row) => {
      const local = await downloadWithRetry(row.url, "tmdb");
      if (local && local !== row.url) {
        await update(row.id, local);
        downloaded++;
      } else {
        failed++;
      }
      done++;
      if (done % 200 === 0) console.log(`  ${label}: ${done}/${rows.length}`);
    },
    CONCURRENCY,
  );

  console.log(`${label}: done — ${downloaded} downloaded, ${failed} failed (left on remote URL)`);
  return { downloaded, failed };
}

async function main() {
  const startedAt = Date.now();

  const dramas = await prisma.drama.findMany({
    where: { posterUrl: { startsWith: TMDB_HOST } },
    select: { id: true, posterUrl: true },
  });
  const dramaResult = await backfillField(
    "Dramas",
    dramas.map((d) => ({ id: d.id, url: d.posterUrl! })),
    (id, url) => prisma.drama.update({ where: { id }, data: { posterUrl: url } }),
  );

  const performers = await prisma.performer.findMany({
    where: { photoUrl: { startsWith: TMDB_HOST } },
    select: { id: true, photoUrl: true },
  });
  const performerResult = await backfillField(
    "Performers",
    performers.map((p) => ({ id: p.id, url: p.photoUrl! })),
    (id, url) => prisma.performer.update({ where: { id }, data: { photoUrl: url } }),
  );

  const agencies = await prisma.agency.findMany({
    where: { logoUrl: { startsWith: TMDB_HOST } },
    select: { id: true, logoUrl: true },
  });
  const agencyResult = await backfillField(
    "Agencies",
    agencies.map((a) => ({ id: a.id, url: a.logoUrl! })),
    (id, url) => prisma.agency.update({ where: { id }, data: { logoUrl: url } }),
  );

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`\n=== Done in ${elapsedMin} min ===`);
  console.log(`Dramas: ${dramaResult.downloaded} downloaded, ${dramaResult.failed} failed`);
  console.log(`Performers: ${performerResult.downloaded} downloaded, ${performerResult.failed} failed`);
  console.log(`Agencies: ${agencyResult.downloaded} downloaded, ${agencyResult.failed} failed`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
