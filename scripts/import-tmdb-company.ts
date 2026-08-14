import "dotenv/config";
import { parseTmdbCompanyId } from "../src/lib/tmdb";
import { importTmdbCompany } from "../src/lib/tmdbImport";

/**
 * Imports every TV show TMDB credits to a production company (e.g.
 * Studio Wabi Sabi) — same show list themoviedb.org's own company "TV"
 * tab shows — and adds the company as an Agency on both every drama and
 * every cast member. Run with:
 *   npx tsx scripts/import-tmdb-company.ts <tmdb-company-url-or-id>
 */
async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npx tsx scripts/import-tmdb-company.ts <tmdb-company-url-or-id>");
    process.exit(1);
  }
  const companyId = parseTmdbCompanyId(input);
  if (!companyId) {
    console.error(`Could not parse a TMDB company id from "${input}"`);
    process.exit(1);
  }

  const startedAt = Date.now();
  const result = await importTmdbCompany(companyId, (msg) => console.log(msg));

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log("\n=== Done in " + elapsedMin + " min ===");
  console.log(`Студия: ${result.companyName}`);
  console.log(`Сериалов найдено: ${result.totalShows}`);
  console.log(`Создано: ${result.dramasCreated}, обновлено: ${result.dramasUpdated}`);
  console.log(`Новых исполнителей в составах: ${result.castCreated}`);
  console.log(`Студия проставлена у исполнителей: ${result.performersAgencyAdded}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
