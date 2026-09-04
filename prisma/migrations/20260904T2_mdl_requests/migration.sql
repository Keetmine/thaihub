-- Заявки «добавьте сериал» из пользовательского импорта списка MDL +
-- уведомление DRAMA_ADDED при их резолве.

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'DRAMA_ADDED';

-- CreateTable
CREATE TABLE "MdlDramaRequest" (
    "id" TEXT NOT NULL,
    "mdlUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedDramaId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "MdlDramaRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdlDramaRequestUser" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WatchStatus" NOT NULL,
    "episodesWatched" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MdlDramaRequestUser_pkey" PRIMARY KEY ("requestId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MdlDramaRequest_mdlUrl_key" ON "MdlDramaRequest"("mdlUrl");

-- CreateIndex
CREATE INDEX "MdlDramaRequest_resolvedAt_rejectedAt_idx" ON "MdlDramaRequest"("resolvedAt", "rejectedAt");

-- CreateIndex
CREATE INDEX "MdlDramaRequestUser_userId_idx" ON "MdlDramaRequestUser"("userId");

-- AddForeignKey
ALTER TABLE "MdlDramaRequest" ADD CONSTRAINT "MdlDramaRequest_resolvedDramaId_fkey" FOREIGN KEY ("resolvedDramaId") REFERENCES "Drama"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdlDramaRequestUser" ADD CONSTRAINT "MdlDramaRequestUser_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MdlDramaRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdlDramaRequestUser" ADD CONSTRAINT "MdlDramaRequestUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
