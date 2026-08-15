import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchTmdbPerson } from "../src/lib/tmdb";
import { matchTmdbPerson } from "../src/lib/tmdbImport";
import { syncSocialLinks } from "../src/lib/performerSocialLinks";

/**
 * One-off backfill: performers who belong to at least one Agency but are
 * missing a birthDate or have no social links, even though TMDB has
 * them — `fetchTmdbPerson` didn't fetch `birthday`/`external_ids` until
 * now (see tmdb.ts), so every performer created before that fix is
 * missing data TMDB actually had all along. Same tmdbId-then-realName-
 * match approach as backfill-agency-photos.ts. Run with:
 *   npx tsx scripts/backfill-agency-profile-details.ts
 */
async function main() {
  const performers = await prisma.performer.findMany({
    where: {
      agencies: { some: {} },
      OR: [{ birthDate: null }, { links: { none: {} } }],
    },
    select: { id: true, name: true, realName: true, tmdbId: true, birthDate: true },
  });
  console.log(`Найдено для проверки: ${performers.length}`);

  let birthDateFilled = 0;
  let linksAdded = 0;
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

        const claimedBy = await prisma.performer.findUnique({ where: { tmdbId } });
        if (claimedBy && claimedBy.id !== p.id) {
          console.log(`${progress} — tmdbId уже занят другим исполнителем (${claimedBy.name}), пропущен`);
          noMatch += 1;
          continue;
        }
      }

      const person = await fetchTmdbPerson(tmdbId);
      const data: { tmdbId?: string; birthDate?: Date } = {};
      if (!p.tmdbId) data.tmdbId = tmdbId;
      if (!p.birthDate && person.birthDate) data.birthDate = new Date(person.birthDate);
      if (Object.keys(data).length > 0) {
        await prisma.performer.update({ where: { id: p.id }, data });
        if (data.birthDate) birthDateFilled += 1;
      }

      const before = await prisma.performerLink.count({ where: { performerId: p.id } });
      await syncSocialLinks(p.id, person.socialLinks);
      const after = await prisma.performerLink.count({ where: { performerId: p.id } });
      if (after > before) linksAdded += 1;

      console.log(
        `${progress} — birthday: ${person.birthDate ?? "нет на TMDB"}, ссылок добавлено: ${after - before}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`${progress} — ОШИБКА: ${message}`);
    }
  }

  console.log("\n=== Готово ===");
  console.log(`Дата рождения заполнена: ${birthDateFilled}`);
  console.log(`Ссылки добавлены хотя бы одному полю у: ${linksAdded}`);
  console.log(`Не найдено на TMDB / пропущено: ${noMatch}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  });
