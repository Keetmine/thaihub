import "dotenv/config";
import { syncAllPerformersFromTmdb } from "../src/lib/tmdbImport";

/**
 * One-off bulk sweep: matches every solo Performer already in the
 * catalog against TMDB (by tmdbId if they have one, otherwise search-
 * and-match by realName) and pulls in their place of birth plus every
 * "known for" show (and its full cast). Run after
 * scripts/sync-dramas-tmdb.ts, per docs/features/tmdb-import.md, so most
 * of the catalog's dramas already have a tmdbId by the time this runs.
 *   npx tsx scripts/sync-performers-tmdb.ts
 */
async function main() {
  const startedAt = Date.now();
  const result = await syncAllPerformersFromTmdb((msg) => console.log(msg));

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log("\n=== Done in " + elapsedMin + " min ===");
  console.log(`Всего: ${result.total}`);
  console.log(`Синхронизировано: ${result.synced}`);
  console.log(`Не найдено на TMDB: ${result.notFound}`);
  console.log(`Ошибок: ${result.errors}`);
  console.log(`Новых сериалов: ${result.dramasCreated}`);
  console.log(`Обновлено сериалов: ${result.dramasUpdated}`);
  console.log(`Новых исполнителей в составах: ${result.castCreated}`);
  console.log(`Пропущено конфликтующих сериалов: ${result.showsSkipped}`);
  if (result.notFoundNames.length > 0) {
    console.log("\nНе найдены:");
    for (const name of result.notFoundNames) console.log(`  - ${name}`);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
