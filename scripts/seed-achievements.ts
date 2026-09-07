import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ACHIEVEMENT_SEED, type AchievementSeed } from "../src/lib/achievements";
import { COMMUNITY_ACHIEVEMENT_SEED } from "../src/lib/communityAchievements";

// Переносит стартовый набор ачивок (раньше зашитый в код) в таблицу
// Achievement. Идемпотентен: upsert по key — существующие записи получают
// свежие поля из сида, НО enabled не трогается (выключенную в админке
// ачивку повторный прогон не включит обратно).
// Он же — единственный способ доставить в базу НОВУЮ ачивку из
// ACHIEVEMENT_SEED: добавили строку в код — прогнали скрипт.
//
// Наборов два — личный и сообществ, — но таблица одна: чья ачивка,
// говорит `scope`. Уже ВЫДАННЫЕ ачивки (UserAchievement /
// CommunityAchievement) скрипт не трогает вовсе: связь у них по key, а
// ключи стабильны.

const ALL_SEEDS: AchievementSeed[] = [...ACHIEVEMENT_SEED, ...COMMUNITY_ACHIEVEMENT_SEED];

async function main() {
  for (const a of ALL_SEEDS) {
    // scope пишем явно (у личных он не указан — значит USER): иначе
    // ачивка сообщества, заведённая до появления scope, осталась бы
    // личной и считалась бы по чужому своду.
    const scope = a.scope ?? "USER";
    await prisma.achievement.upsert({
      where: { key: a.key },
      create: { ...a, scope },
      update: {
        scope,
        emoji: a.emoji,
        title: a.title,
        hint: a.hint,
        metric: a.metric,
        threshold: a.threshold,
        sort: a.sort,
      },
    });
  }
  console.log(
    `ok: ${ALL_SEEDS.length} achievements upserted ` +
      `(личных ${ACHIEVEMENT_SEED.length}, сообществ ${COMMUNITY_ACHIEVEMENT_SEED.length})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
