import "dotenv/config";
import { chromium } from "playwright";
import { syncGmmtvArtists } from "../src/lib/gmmtvImport";

/**
 * One-off backfill: creates/updates a Performer for every artist on
 * GMMTV's roster, linked to the "GMMTV" Agency. Run with:
 *   npx tsx scripts/import-gmmtv.ts
 *
 * The admin "Проверить GMMTV" button runs the exact same
 * syncGmmtvArtists() (with replacePhotos: false by default there, so it
 * doesn't clobber a photo an admin picked by hand later) — this script
 * exists so the large first pass (and its explicit "replace all photos
 * this run" request) doesn't have to happen inside a single HTTP
 * request/response.
 */
async function main() {
  const startedAt = Date.now();
  const browser = await chromium.launch();

  try {
    const result = await syncGmmtvArtists(browser, { replacePhotos: true }, (msg) => console.log(msg));

    const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
    console.log("\n=== Done in " + elapsedMin + " min ===");
    console.log(`Checked: ${result.checked}`);
    console.log(`Created: ${result.created.length}`);
    console.log(`Updated: ${result.updated.length}`);
    console.log(`Failed: ${result.errors.length}`);
    if (result.errors.length > 0) {
      console.log("\nFailures:");
      for (const e of result.errors) console.log(`  - id ${e.id}: ${e.message}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
