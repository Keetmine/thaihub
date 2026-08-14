import "dotenv/config";
import { syncAllDramasFromTmdb } from "../src/lib/tmdbImport";

/**
 * One-off bulk sweep: matches every Drama already in the catalog against
 * TMDB (by tmdbId if it has one, otherwise search-and-match by title/
 * year) and refreshes its metadata + full cast. Run with:
 *   npx tsx scripts/sync-dramas-tmdb.ts
 */
async function main() {
  const startedAt = Date.now();
  const result = await syncAllDramasFromTmdb((msg) => console.log(msg));

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log("\n=== Done in " + elapsedMin + " min ===");
  console.log(`Всего: ${result.total}`);
  console.log(`Создано: ${result.created}`);
  console.log(`Обновлено: ${result.updated}`);
  console.log(`Не найдено на TMDB: ${result.notFound}`);
  console.log(`Конфликтов (похоже на дубль в каталоге): ${result.conflicts}`);
  console.log(`Ошибок: ${result.errors}`);
  console.log(`Новых исполнителей в составах: ${result.castCreated}`);
  if (result.notFoundTitles.length > 0) {
    console.log("\nНе найдены:");
    for (const title of result.notFoundTitles) console.log(`  - ${title}`);
  }
  if (result.conflictTitles.length > 0) {
    console.log("\nКонфликты (нужен ручной мёрж через /admin/duplicates):");
    for (const title of result.conflictTitles) console.log(`  - ${title}`);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
