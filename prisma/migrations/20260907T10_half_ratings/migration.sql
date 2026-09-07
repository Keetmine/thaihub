-- Шкала оценок с половинками и оценки отзыва по разделам
-- (правка владельца 2026-09-07).
--
-- Своя оценка сериалу и оценка отзыва становятся дробными: у
-- MyDramaList шкала с шагом 0.5, и при импорте оценки округлялись
-- («8.5» превращалась в 9). Целые значения переживают смену типа как
-- есть.
ALTER TABLE "DramaWatchStatus" ALTER COLUMN "rating" TYPE DOUBLE PRECISION;
ALTER TABLE "Review" ALTER COLUMN "rating" TYPE DOUBLE PRECISION;

-- Оценки отзыва по разделам: сюжет, актёры, музыка. Необязательные —
-- модель Review общая для сериалов, новелл и событий, у новеллы «игра
-- актёров» смысла не имеет. Общая оценка остаётся в "rating".
ALTER TABLE "Review" ADD COLUMN "ratingStory" DOUBLE PRECISION;
ALTER TABLE "Review" ADD COLUMN "ratingActing" DOUBLE PRECISION;
ALTER TABLE "Review" ADD COLUMN "ratingMusic" DOUBLE PRECISION;
