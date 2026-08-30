-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'EPISODE_AIRED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tgNotifyEpisodes" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "EpisodeNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChatState" (
    "chatId" TEXT NOT NULL,
    "lastUserMessageAt" TIMESTAMP(3) NOT NULL,
    "lastAdminReplyAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChatState_pkey" PRIMARY KEY ("chatId")
);

-- CreateIndex
CREATE INDEX "EpisodeNotification_episodeId_idx" ON "EpisodeNotification"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeNotification_userId_episodeId_key" ON "EpisodeNotification"("userId", "episodeId");

-- AddForeignKey
ALTER TABLE "EpisodeNotification" ADD CONSTRAINT "EpisodeNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeNotification" ADD CONSTRAINT "EpisodeNotification_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

