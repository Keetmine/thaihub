-- Черновики событий из краулера афиши ThaiTicketMajor: очередь на
-- одобрение владельцем + память краулера (docs/features/ttm-crawl.md).

-- CreateEnum
CREATE TYPE "EventDraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NO_MATCH');

-- CreateTable
CREATE TABLE "EventDraft" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "matchedPerformers" JSONB NOT NULL,
    "status" "EventDraftStatus" NOT NULL DEFAULT 'PENDING',
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "EventDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventDraft_sourceUrl_key" ON "EventDraft"("sourceUrl");

-- CreateIndex
CREATE INDEX "EventDraft_status_idx" ON "EventDraft"("status");
