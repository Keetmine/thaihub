-- Черновики маскотов GMMTV со страницы Mascots фан-вики: очередь на
-- одобрение владельцем + память краулера
-- (docs/features/gmmtv-mascots-import.md).

-- CreateEnum
CREATE TYPE "MascotDraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "MascotDraft" (
    "id" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "matchedOwners" JSONB NOT NULL,
    "status" "MascotDraftStatus" NOT NULL DEFAULT 'PENDING',
    "performerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "MascotDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MascotDraft_nameKey_key" ON "MascotDraft"("nameKey");

-- CreateIndex
CREATE INDEX "MascotDraft_status_idx" ON "MascotDraft"("status");
