-- Сообщества (АА25): «Лакорны Беларусь» и подобное — место, где люди
-- находят единомышленников. Заводит обладатель подписки, вступает любой
-- вошедший; правила вступления настраивает владелец сообщества.
-- См. docs/features/communities.md.

CREATE TYPE "CommunityVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "CommunityJoinMode" AS ENUM ('OPEN', 'APPROVAL');
CREATE TYPE "CommunityRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');
CREATE TYPE "CommunityMemberStatus" AS ENUM ('PENDING', 'ACTIVE');

-- Заявка на вступление — владельцу, решение по ней — заявителю.
ALTER TYPE "NotificationKind" ADD VALUE 'COMMUNITY_JOIN_REQUEST';
ALTER TYPE "NotificationKind" ADD VALUE 'COMMUNITY_JOIN_ANSWER';

CREATE TABLE "Community" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT,
  "ownerId"     TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "coverUrl"    TEXT,
  "visibility"  "CommunityVisibility" NOT NULL DEFAULT 'PUBLIC',
  "joinMode"    "CommunityJoinMode" NOT NULL DEFAULT 'OPEN',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");
CREATE INDEX "Community_ownerId_idx" ON "Community"("ownerId");
ALTER TABLE "Community" ADD CONSTRAINT "Community_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommunityLink" (
  "id"          TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityLink_communityId_idx" ON "CommunityLink"("communityId");
ALTER TABLE "CommunityLink" ADD CONSTRAINT "CommunityLink_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommunityMember" (
  "communityId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "role"        "CommunityRole" NOT NULL DEFAULT 'MEMBER',
  "status"      "CommunityMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityMember_pkey" PRIMARY KEY ("communityId", "userId")
);
CREATE INDEX "CommunityMember_userId_idx" ON "CommunityMember"("userId");
CREATE INDEX "CommunityMember_communityId_status_idx" ON "CommunityMember"("communityId", "status");
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
