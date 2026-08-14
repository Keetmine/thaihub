import "dotenv/config";
import { chromium } from "playwright";
import { importMemindyAgency } from "../src/lib/memindyImport";

/**
 * Imports Me Mind Y's full artist roster (memindy.com/en/artist/): the
 * agency, every artist (matched/created, photo + social links filled
 * in), and every title in their "Previous Works — Series" list,
 * cross-checked against TMDB. Needs a real browser — the artist grid is
 * rendered by an isotope script, not present in the raw HTML. Run with:
 *   npx tsx scripts/import-memindy.ts
 */
async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    });

    const startedAt = Date.now();
    const result = await importMemindyAgency(page, (msg) => console.log(msg));

    const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
    console.log("\n=== Done in " + elapsedMin + " min ===");
    console.log(
      `Артисты — создано: ${result.artistsCreated}, найдено существующих: ${result.artistsMatched} (агентство проставлено у ${result.artistsAgencySet})`,
    );
    console.log(`Сериалы — создано: ${result.seriesCreated}, обновлено: ${result.seriesUpdated}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
