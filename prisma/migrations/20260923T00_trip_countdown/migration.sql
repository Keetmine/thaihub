-- Обратный отсчёт до поездки (АА9, правка владельца 2026-09-23: «будем
-- отправлять каждый день до поездки, если до неё осталось меньше
-- месяца — отсчёт начнётся с сообщения, что поездка через месяц»).
--
-- Свой переключатель в Telegram-настройках: повод ежедневный и на целый
-- месяц, приглашения в поездки (tgNotifyInvites) человек может хотеть
-- оставить. Новый вид уведомления — для колокольчика и текста.
-- Дедуп — одна строка на человека, поездку и календарный день: по дню,
-- а не по «сколько осталось», чтобы сдвинутая поездка не молчала на
-- числах, которые уже прошли по старой дате.
ALTER TABLE "User" ADD COLUMN "tgNotifyTrips" BOOLEAN NOT NULL DEFAULT true;

ALTER TYPE "NotificationKind" ADD VALUE 'TRIP_COUNTDOWN';

CREATE TABLE "TripCountdownNotification" (
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripCountdownNotification_pkey" PRIMARY KEY ("userId", "tripId", "day")
);

CREATE INDEX "TripCountdownNotification_tripId_idx" ON "TripCountdownNotification"("tripId");

ALTER TABLE "TripCountdownNotification" ADD CONSTRAINT "TripCountdownNotification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripCountdownNotification" ADD CONSTRAINT "TripCountdownNotification_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
