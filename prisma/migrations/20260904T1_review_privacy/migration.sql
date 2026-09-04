-- Приватность отзыва: видит только автор, в средний рейтинг не входит.
ALTER TABLE "Review" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
