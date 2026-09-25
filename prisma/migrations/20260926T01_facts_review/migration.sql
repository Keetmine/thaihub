-- Очередь фактов артистов на проверку (просьба владельца 2026-09-26):
-- импортёры кладут сюда пришедшие факты, владелец разбирает их руками
-- в /admin/facts — «до / после объединения / перевод» — и применяет.
CREATE TABLE "FactsReview" (
    "id" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "incoming" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "FactsReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FactsReview_status_createdAt_idx" ON "FactsReview"("status", "createdAt");
CREATE INDEX "FactsReview_performerId_idx" ON "FactsReview"("performerId");
ALTER TABLE "FactsReview" ADD CONSTRAINT "FactsReview_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
