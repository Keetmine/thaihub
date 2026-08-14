import "dotenv/config";
import { chromium } from "playwright";
import { syncNewDramasFromBlscene } from "../src/lib/blsceneImport";

/**
 * One-off backfill: imports every blscene.com drama not already in our DB,
 * with all its filming locations (coordinates resolved where possible).
 * Run with: npx tsx scripts/import-blscene.ts
 *
 * The admin "Проверить актуальный список" button runs the exact same
 * syncNewDramasFromBlscene() — this script exists only so a large first
 * pass doesn't have to happen inside a single HTTP request/response.
 */
async function main() {
  const startedAt = Date.now();
  const browser = await chromium.launch();

  try {
    const result = await syncNewDramasFromBlscene(browser, (msg) => console.log(msg));

    const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
    console.log("\n=== Done in " + elapsedMin + " min ===");
    console.log(`Checked: ${result.checked}`);
    console.log(`Imported: ${result.imported.length}`);
    console.log(`Failed: ${result.errors.length}`);
    if (result.errors.length > 0) {
      console.log("\nFailures:");
      for (const e of result.errors) console.log(`  - ${e.title}: ${e.message}`);
    }
    const totalLocations = result.imported.reduce((sum, d) => sum + d.locationsImported, 0);
    const totalWithCoords = result.imported.reduce((sum, d) => sum + d.locationsWithCoords, 0);
    console.log(`\nTotal location links created: ${totalLocations} (${totalWithCoords} with coordinates)`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
