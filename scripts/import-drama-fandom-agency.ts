import "dotenv/config";
import { chromium } from "playwright";
import { importDramaFandomAgency } from "../src/lib/dramaFandomAgencyImport";

/**
 * Imports one talent agency from its drama.fandom.com category page
 * (e.g. Be On Cloud): the agency itself, its productions, and its full
 * current/former artist roster. Needs a real browser — the page sits
 * behind a Cloudflare bot-check a plain fetch can't get past. Run with:
 *   npx tsx scripts/import-drama-fandom-agency.ts <drama-fandom-url>
 */
async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npx tsx scripts/import-drama-fandom-agency.ts <drama-fandom-url>");
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    });

    const startedAt = Date.now();
    const result = await importDramaFandomAgency(input, page, (msg) => console.log(msg));

    const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
    console.log("\n=== Done in " + elapsedMin + " min ===");
    console.log(`Агентство: ${result.agencyName}`);
    console.log(`Сериалы — создано: ${result.productionsCreated}, обновлено: ${result.productionsUpdated}`);
    console.log(
      `Артисты — создано: ${result.artistsCreated}, найдено существующих: ${result.artistsMatched} (агентство проставлено у ${result.artistsAgencySet})`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
