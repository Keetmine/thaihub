import "dotenv/config";
import { importChange2561 } from "../src/lib/change2561Import";

/**
 * Imports CHANGE 2561: productions from its Wikipedia article, artists
 * from its own site (change2561.com/changeartist). No browser needed —
 * both sources are reachable via plain fetch. Run with:
 *   npx tsx scripts/import-change2561.ts
 */
async function main() {
  const startedAt = Date.now();
  const result = await importChange2561((msg) => console.log(msg));

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log("\n=== Done in " + elapsedMin + " min ===");
  console.log(`Сериалы — создано: ${result.productionsCreated}, обновлено: ${result.productionsUpdated}`);
  console.log(
    `Артисты — создано: ${result.artistsCreated}, найдено существующих: ${result.artistsMatched} (агентство проставлено у ${result.artistsAgencySet})`,
  );
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
