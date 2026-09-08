-- Аудит 2026-09, раздел 5 пп. 1 и 5: «у избранного артиста новое
-- событие» и «стартовал сериал из ваших планов».
ALTER TYPE "NotificationKind" ADD VALUE 'PERFORMER_EVENT';
ALTER TYPE "NotificationKind" ADD VALUE 'DRAMA_STARTED';

-- Дедуп «новое событие избранного артиста»: одна пара (user, event) —
-- уведомление одно, сколько бы избранных артистов ни было в составе и
-- когда бы состав ни пересобирали.
CREATE TABLE "PerformerEventNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformerEventNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PerformerEventNotification_userId_eventId_key" ON "PerformerEventNotification"("userId", "eventId");

CREATE INDEX "PerformerEventNotification_eventId_idx" ON "PerformerEventNotification"("eventId");

ALTER TABLE "PerformerEventNotification" ADD CONSTRAINT "PerformerEventNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PerformerEventNotification" ADD CONSTRAINT "PerformerEventNotification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
