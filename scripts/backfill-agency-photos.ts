import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchTmdbPerson } from "../src/lib/tmdb";
import { matchTmdbPerson } from "../src/lib/tmdbImport";

/**
 * One-off backfill: performers who belong to at least one Agency but
 * have no photoUrl. Most were created directly from an agency page's
 * name/nickname text (Wikipedia, drama.fandom.com, memindy.com,
 * change2561.com) with no photo of their own to pull from — those get
 * one via TMDB if a match exists. A smaller set already have a tmdbId
 * (set by matching an *existing* Performer row rather than creating a
 * new one) but were never backfilled, since agencyTmdbMatching.ts's
 * "existing performer" path only adds the agency, on purpose — it
 * never overwrites profile fields on a row that might have been
 * manually curated. Run with:
 *   npx tsx scripts/backfill-agency-photos.ts
 */
async function main() {
  const performers = await prisma.performer.findMany({
    where: { agencies: { some: {} }, photoUrl: null },
    select: { id: true, name: true, realName: true, tmdbId: true },
  });
  console.log(`Найдено без фото: ${performers.length}`);

  let filled = 0;
  let noTmdbPhoto = 0;
  let noMatch = 0;

  for (const [i, p] of performers.entries()) {
    const progress = `[${i + 1}/${performers.length}] ${p.name}`;
    try {
      let tmdbId = p.tmdbId;

      if (!tmdbId) {
        if (!p.realName) {
          console.log(`${progress} — пропущен (нет tmdbId и realName)`);
          noMatch += 1;
          continue;
        }
        const personId = await matchTmdbPerson(p.realName);
        if (!personId) {
          console.log(`${progress} — не найден на TMDB`);
          noMatch += 1;
          continue;
        }
        tmdbId = String(personId);

        // Same defensive check as agencyTmdbMatching.ts: this tmdbId
        // might already belong to a different Performer row.
        const claimedBy = await prisma.performer.findUnique({ where: { tmdbId } });
        if (claimedBy && claimedBy.id !== p.id) {
          console.log(`${progress} — tmdbId уже занят другим исполнителем (${claimedBy.name}), пропущен`);
          noMatch += 1;
          continue;
        }
      }

      const person = await fetchTmdbPerson(tmdbId);
      if (!person.photoUrl) {
        console.log(`${progress} — на TMDB нет фото`);
        noTmdbPhoto += 1;
        continue;
      }

      await prisma.performer.update({
        where: { id: p.id },
        data: { photoUrl: person.photoUrl, ...(p.tmdbId ? {} : { tmdbId }) },
      });
      filled += 1;
      console.log(`${progress} — фото добавлено`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`${progress} — ОШИБКА: ${message}`);
    }
  }

  console.log("\n=== Готово ===");
  console.log(`Добавлено фото: ${filled}`);
  console.log(`На TMDB нет фото: ${noTmdbPhoto}`);
  console.log(`Не найдено на TMDB / пропущено: ${noMatch}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  });
