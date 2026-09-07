import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ACHIEVEMENT_SEED } from "../src/lib/achievements";

// Переносит стартовый набор ачивок (раньше зашитый в код) в таблицу
// Achievement. Идемпотентен: upsert по key — существующие записи получают
// свежие поля из сида, НО enabled не трогается (выключенную в админке
// ачивку повторный прогон не включит обратно).
// Он же — единственный способ доставить в базу НОВУЮ ачивку из
// ACHIEVEMENT_SEED: добавили строку в код — прогнали скрипт.

async function main() {
  for (const a of ACHIEVEMENT_SEED) {
    await prisma.achievement.upsert({
      where: { key: a.key },
      create: a,
      update: {
        emoji: a.emoji,
        title: a.title,
        hint: a.hint,
        metric: a.metric,
        threshold: a.threshold,
        sort: a.sort,
      },
    });
  }
  console.log(`ok: ${ACHIEVEMENT_SEED.length} achievements upserted`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
