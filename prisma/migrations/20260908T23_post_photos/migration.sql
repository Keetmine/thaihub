-- Картинки самой темы обсуждения — своей таблицей (АА25).
--
-- До этого они висели на «служебном комментарии» с пустым текстом:
-- строка-призрак в ОБЩЕЙ таблице комментариев, про которую пришлось бы
-- помнить каждому месту, что комментарии считает или показывает —
-- ленте темы, счётчику в списке, админской модерации. Дешевле таблица,
-- чем исключение в пяти местах.
CREATE TABLE "CommunityPostPhoto" (
  "id"        TEXT NOT NULL,
  "postId"    TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "sort"      INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityPostPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityPostPhoto_postId_idx" ON "CommunityPostPhoto"("postId");
ALTER TABLE "CommunityPostPhoto" ADD CONSTRAINT "CommunityPostPhoto_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Переносим то, что успело записаться носителями (на проде таких нет —
-- фича не выкладывалась, но локальные копии живут своей жизнью).
INSERT INTO "CommunityPostPhoto" ("id", "postId", "url", "sort", "createdAt")
SELECT cp."id", c."postId", cp."url", cp."sort", cp."createdAt"
FROM "CommentPhoto" cp
JOIN "Comment" c ON c."id" = cp."commentId"
JOIN "CommunityPost" p ON p."id" = c."postId"
WHERE c."text" = '' AND c."userId" = p."authorId";

DELETE FROM "Comment" c
USING "CommunityPost" p
WHERE c."postId" = p."id" AND c."text" = '' AND c."userId" = p."authorId";
