-- Своя оценка сериалу (АА2): 1-10 у строки статуса просмотра. Оценку
-- ставят почти все, отзыв пишут единицы — раньше поставить балл без
-- текста было негде.
ALTER TABLE "DramaWatchStatus" ADD COLUMN "rating" INTEGER;

-- Ничего не теряем: у кого оценка уже стояла в отзыве на сериал,
-- переносим её сюда. Отзыв при этом остаётся как есть.
UPDATE "DramaWatchStatus" ws
SET "rating" = r."rating"
FROM "Review" r
WHERE r."userId" = ws."userId"
  AND r."dramaId" = ws."dramaId"
  AND ws."rating" IS NULL;

-- А если отзыв есть, а строки статуса нет — заводим её со статусом
-- «просмотрено»: человек посмотрел и оценил, просто не отмечал.
INSERT INTO "DramaWatchStatus" ("userId", "dramaId", "status", "rating", "updatedAt")
SELECT r."userId", r."dramaId", 'COMPLETED', r."rating", NOW()
FROM "Review" r
WHERE r."dramaId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DramaWatchStatus" ws
    WHERE ws."userId" = r."userId" AND ws."dramaId" = r."dramaId"
  );
