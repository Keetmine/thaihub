-- Поля для фич из аудита 2026-09 (волна 2), одной миграцией: параллельные
-- правки не должны наперегонки генерировать Prisma-клиент.

-- Когда сериал досмотрен. Заполняется при переходе в COMPLETED; старым
-- строкам НЕ проставляем updatedAt задним числом: мы не знаем настоящей
-- даты, а «Итоги года» из выдуманных дат хуже, чем из неполных.
ALTER TABLE "DramaWatchStatus" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Онлайн-встреча сообщества: без места, смотрим вместе из дома.
ALTER TABLE "Event" ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false;

-- Кто привёл человека (реферальная ссылка /signup?ref=...).
ALTER TABLE "User" ADD COLUMN "referredById" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey"
  FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- Дневник серий: отметка конкретной серии с датой и заметкой-впечатлением.
CREATE TABLE "EpisodeWatch" (
  "userId" TEXT NOT NULL,
  "dramaId" TEXT NOT NULL,
  "episode" INTEGER NOT NULL,
  "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "EpisodeWatch_pkey" PRIMARY KEY ("userId", "dramaId", "episode"),
  CONSTRAINT "EpisodeWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EpisodeWatch_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EpisodeWatch_dramaId_idx" ON "EpisodeWatch"("dramaId");
