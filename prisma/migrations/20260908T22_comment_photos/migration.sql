-- Фото в комментариях (АА20 + обсуждения сообществ) и поездки
-- сообщества (АА25).

-- Картинки к комментарию: несколько штук с порядком, поэтому отдельной
-- таблицей, а не полем. Файлы уходят в общий /api/upload — потолки
-- размера и частоты живут там.
CREATE TABLE "CommentPhoto" (
  "id"        TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "sort"      INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommentPhoto_commentId_idx" ON "CommentPhoto"("commentId");
ALTER TABLE "CommentPhoto" ADD CONSTRAINT "CommentPhoto_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Поездка, собранная сообществом. SET NULL, а не CASCADE: сообщество
-- закрылось — поездка людей остаётся, они на неё уже купили билеты.
ALTER TABLE "Trip" ADD COLUMN "communityId" TEXT;
CREATE INDEX "Trip_communityId_idx" ON "Trip"("communityId");
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;
