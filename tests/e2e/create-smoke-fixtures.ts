import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import {
  SIMILAR_CANDIDATES,
  SIMILAR_GENRE,
  SIMILAR_PERFORMERS,
  SIMILAR_SOURCE,
  TODAY_DRAMA,
} from "./testSmokeFixtures";

/**
 * Фикстуры для similar-dramas.spec.ts и calendar-series.spec.ts
 * (запускается отдельным tsx-процессом — Prisma в спеки не импортировать,
 * см. docs/testing.md).
 *
 * - Рекомендации: исходник и два кандидата делят двух актёров-маркеров и
 *   жанр-маркер — у каждого кандидата счёт 2×3 + 1 = 7 при пороге 2,
 *   а настоящие записи по маркерам не совпадают ни на одной базе.
 * - «Выходит сегодня»: у TODAY_DRAMA серия с airDate на текущие
 *   UTC-сутки (главная фильтрует startOfDay..endOfDay в UTC). Полдень —
 *   чтобы прогон, зацепивший полночь, не выпал из окна ни в одну сторону.
 */

async function main() {
  const performerIds: string[] = [];
  for (const p of SIMILAR_PERFORMERS) {
    const row = await prisma.performer.upsert({
      where: { slug: p.slug },
      update: { name: p.name },
      create: { slug: p.slug, name: p.name },
    });
    performerIds.push(row.id);
  }

  const dramas = [SIMILAR_SOURCE, ...SIMILAR_CANDIDATES];
  for (const d of dramas) {
    const year = "year" in d ? d.year : null;
    const drama = await prisma.drama.upsert({
      where: { slug: d.slug },
      update: { genres: [SIMILAR_GENRE], year },
      create: { slug: d.slug, title: d.title, genres: [SIMILAR_GENRE], year },
    });
    for (const performerId of performerIds) {
      await prisma.performerDrama.upsert({
        where: { performerId_dramaId: { performerId, dramaId: drama.id } },
        update: {},
        create: { performerId, dramaId: drama.id },
      });
    }
  }

  const today = await prisma.drama.upsert({
    where: { slug: TODAY_DRAMA.slug },
    update: { episodes: TODAY_DRAMA.episodes, status: "RETURNING_SERIES" },
    create: {
      slug: TODAY_DRAMA.slug,
      title: TODAY_DRAMA.title,
      episodes: TODAY_DRAMA.episodes,
      status: "RETURNING_SERIES",
    },
  });
  const now = new Date();
  const airDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12),
  );
  await prisma.dramaEpisode.upsert({
    where: {
      dramaId_number: { dramaId: today.id, number: TODAY_DRAMA.episodeNumber },
    },
    update: { airDate },
    create: { dramaId: today.id, number: TODAY_DRAMA.episodeNumber, airDate },
  });

  console.log("ok");
}

main().finally(() => prisma.$disconnect());
