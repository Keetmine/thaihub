import "dotenv/config";
import { importTpopBand } from "../src/lib/tpopFandomImport";

/**
 * Imports one idol group from its tpop.fandom.com article: the band
 * itself (bio synthesized from Origin/Genre/Debut/Label, its label as
 * an Agency) and every member of its current lineup (birth name/date/
 * place/photo/agency, from each member's own page). Run with:
 *   npx tsx scripts/import-tpop-band.ts <tpop-fandom-url-or-title>
 */
async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npx tsx scripts/import-tpop-band.ts <tpop-fandom-url-or-title>");
    process.exit(1);
  }

  const startedAt = Date.now();
  const result = await importTpopBand(input, (msg) => console.log(msg));

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log("\n=== Done in " + elapsedMin + " min ===");
  console.log(`Группа: ${result.bandName} (${result.bandCreated ? "создана" : "обновлена"})`);
  console.log(`Участники — создано: ${result.membersCreated}, найдено существующих: ${result.membersMatched}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
