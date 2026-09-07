-- Ачивки сообществ (АА25, просьба владельца 2026-09-08): их зарабатывают
-- все вместе — «провели первую встречу», «десять участников», — и висят
-- они на странице сообщества, а не в профиле.
--
-- Отдельного каталога ачивок не заводим: строки живут в той же таблице
-- Achievement, а `scope` говорит, чья ачивка. Иначе пришлось бы двоить
-- и сид, и админскую страницу, и подсчёт прогресса.
CREATE TYPE "AchievementScope" AS ENUM ('USER', 'COMMUNITY');
ALTER TABLE "Achievement" ADD COLUMN "scope" "AchievementScope" NOT NULL DEFAULT 'USER';

-- Выданная ачивка сообщества. Связь по КЛЮЧУ, а не по id: ключи
-- стабильны, а строки Achievement пересоздаются сидом (так же устроена
-- UserAchievement).
CREATE TABLE "CommunityAchievement" (
  "communityId" TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "unlockedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityAchievement_pkey" PRIMARY KEY ("communityId", "key")
);
ALTER TABLE "CommunityAchievement" ADD CONSTRAINT "CommunityAchievement_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
