-- AlterTable
ALTER TABLE "Novel" ADD COLUMN     "originalAuthor" TEXT,
ADD COLUMN     "size" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PerformerList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "TripVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformerList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformerListItem" (
    "listId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    "note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PerformerListItem_pkey" PRIMARY KEY ("listId","performerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerformerList_slug_key" ON "PerformerList"("slug");

-- CreateIndex
CREATE INDEX "PerformerList_userId_idx" ON "PerformerList"("userId");

-- AddForeignKey
ALTER TABLE "PerformerList" ADD CONSTRAINT "PerformerList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformerListItem" ADD CONSTRAINT "PerformerListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PerformerList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformerListItem" ADD CONSTRAINT "PerformerListItem_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

