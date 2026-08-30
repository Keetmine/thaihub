-- AlterTable
ALTER TABLE "DramaWatchStatus" ADD COLUMN     "notifyEpisodes" BOOLEAN NOT NULL DEFAULT false;


-- Бэкфилл: «Смотрю сейчас» уже обещал уведомления (З1) — колокольчик у
-- таких строк включён, а не сброшен новой колонкой.
UPDATE "DramaWatchStatus" SET "notifyEpisodes" = true WHERE "status" = 'WATCHING';
