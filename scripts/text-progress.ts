import { prisma } from "@/lib/prisma";

/**
 * Сколько текстов уже переписано и сколько осталось — по отметкам в
 * TextRewrite (см. docs/features/text-rewrite.md). Прогон идёт партиями
 * и неделями, и вопрос «где мы» возникает каждый раз.
 *
 *   npx tsx -r dotenv/config scripts/text-progress.ts
 */
async function main() {
  const done = await prisma.textRewrite.groupBy({ by: ["entity", "field"], _count: true });
  console.log("Переписано:");
  for (const row of done) console.log(`  ${row.entity}.${row.field}: ${row._count}`);
  if (done.length === 0) console.log("  пока ничего");

  const [dramas, withRu, noSynopsis] = await Promise.all([
    prisma.drama.count(),
    prisma.drama.count({ where: { NOT: { synopsisRu: null } } }),
    prisma.drama.count({ where: { synopsis: null, synopsisRu: null } }),
  ]);
  console.log(
    `\nСериалы: ${dramas} всего · с русским описанием ${withRu} · ` +
      `осталось ${dramas - withRu - noSynopsis} (+${noSynopsis} без английского — писать не из чего)`,
  );

  const perf = await prisma.performer.count();
  const withBio = await prisma.performer.count({ where: { NOT: { bio: null } } });
  console.log(`Артисты: ${perf} всего · с биографией ${withBio}`);
}

main().finally(() => prisma.$disconnect());
