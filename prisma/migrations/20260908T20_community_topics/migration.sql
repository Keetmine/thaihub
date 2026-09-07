-- Сообщества: связь с каталогом, место и общие списки мест (АА25).
--
-- Про место отдельными полями: сообщество города или страны любит ВСЕХ
-- актёров и все сериалы, привязать его к каталогу нечем, и находят его
-- по месту, а не по актёру. См. docs/features/communities.md.
ALTER TABLE "Community" ADD COLUMN "country" TEXT;
ALTER TABLE "Community" ADD COLUMN "city" TEXT;

-- О ком или о чём сообщество: до трёх привязок (правило в коде).
CREATE TABLE "CommunityTopic" (
  "id"          TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "performerId" TEXT,
  "dramaId"     TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityTopic_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommunityTopic_communityId_performerId_key" ON "CommunityTopic"("communityId", "performerId");
CREATE UNIQUE INDEX "CommunityTopic_communityId_dramaId_key" ON "CommunityTopic"("communityId", "dramaId");
CREATE INDEX "CommunityTopic_performerId_idx" ON "CommunityTopic"("performerId");
CREATE INDEX "CommunityTopic_dramaId_idx" ON "CommunityTopic"("dramaId");
ALTER TABLE "CommunityTopic" ADD CONSTRAINT "CommunityTopic_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityTopic" ADD CONSTRAINT "CommunityTopic_performerId_fkey"
  FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityTopic" ADD CONSTRAINT "CommunityTopic_dramaId_fkey"
  FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Список мест сообщества: «куда сходить в Минске» ведёт всё сообщество.
ALTER TABLE "PlaceList" ADD COLUMN "communityId" TEXT;
CREATE INDEX "PlaceList_communityId_idx" ON "PlaceList"("communityId");
ALTER TABLE "PlaceList" ADD CONSTRAINT "PlaceList_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
