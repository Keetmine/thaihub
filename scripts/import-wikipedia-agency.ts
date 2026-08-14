import "dotenv/config";
import { importWikipediaAgency } from "../src/lib/wikipediaAgencyImport";

/**
 * Imports one talent agency from its English Wikipedia article: the
 * agency itself, its productions ("Television series" table, network
 * included), announced-but-unreleased shows ("Upcoming TV series"), and
 * its full artist roster ("Current"/"Former"). Run with:
 *   npx tsx scripts/import-wikipedia-agency.ts <wikipedia-url-or-title>
 */
async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npx tsx scripts/import-wikipedia-agency.ts <wikipedia-url-or-title>");
    process.exit(1);
  }

  const startedAt = Date.now();
  const result = await importWikipediaAgency(input, (msg) => console.log(msg));

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log("\n=== Done in " + elapsedMin + " min ===");
  console.log(`Агентство: ${result.agencyName}`);
  console.log(`Сериалы — создано: ${result.productionsCreated}, обновлено: ${result.productionsUpdated}`);
  console.log(`Анонсы — создано: ${result.upcomingCreated}, обновлено: ${result.upcomingUpdated}`);
  console.log(
    `Артисты — создано: ${result.artistsCreated}, найдено существующих: ${result.artistsMatched} (агентство проставлено у ${result.artistsAgencySet})`,
  );
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
