-- Онлайн-бронирование у билета: когда открывается (тайское настенное
-- время в UTC-слоте, как Event.presaleAt), ссылка и отметка «напомнили
-- за час» (дедуп получасового прогона).
ALTER TABLE "EventTicket" ADD COLUMN "onlineBookingAt" TIMESTAMP(3);
ALTER TABLE "EventTicket" ADD COLUMN "onlineBookingUrl" TEXT;
ALTER TABLE "EventTicket" ADD COLUMN "onlineBookingNotifiedAt" TIMESTAMP(3);

CREATE INDEX "EventTicket_onlineBookingAt_idx" ON "EventTicket"("onlineBookingAt");

-- Новый повод уведомления в колокольчике.
ALTER TYPE "NotificationKind" ADD VALUE 'ONLINE_BOOKING';
