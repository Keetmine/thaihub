-- Сообщества, этапы 2 и 3 (АА25): обсуждения, приглашения, бан и
-- встречи сообщества. См. docs/features/communities.md.

-- Выгнанный участник остаётся строкой: без неё он просто вступил бы
-- заново, а «убрать» перестало бы что-либо значить.
ALTER TYPE "CommunityMemberStatus" ADD VALUE 'BANNED';

-- Приглашение — единственный путь в закрытое сообщество: заявок с улицы
-- оно не принимает.
CREATE TABLE "CommunityInvite" (
  "id"          TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommunityInvite_communityId_userId_key" ON "CommunityInvite"("communityId", "userId");
CREATE INDEX "CommunityInvite_userId_idx" ON "CommunityInvite"("userId");
ALTER TABLE "CommunityInvite" ADD CONSTRAINT "CommunityInvite_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityInvite" ADD CONSTRAINT "CommunityInvite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityInvite" ADD CONSTRAINT "CommunityInvite_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Темы обсуждений. Комментарии к ним — общая модель Comment (postId).
CREATE TABLE "CommunityPost" (
  "id"          TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "authorId"    TEXT NOT NULL,
  "title"       TEXT,
  "text"        TEXT NOT NULL,
  "pinned"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityPost_communityId_createdAt_idx" ON "CommunityPost"("communityId", "createdAt");
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment" ADD COLUMN "postId" TEXT;
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Встречи сообщества — те же Event. У каталожных событий communityId
-- остаётся NULL, и выборки афиши обязаны это учитывать
-- (src/lib/catalogEvents.ts).
ALTER TABLE "Event" ADD COLUMN "communityId" TEXT;
ALTER TABLE "Event" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Event" ADD COLUMN "communityOnly" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "Event_communityId_idx" ON "Event"("communityId");
ALTER TABLE "Event" ADD CONSTRAINT "Event_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
