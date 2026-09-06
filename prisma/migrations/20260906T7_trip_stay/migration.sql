-- Свои даты участника в общей поездке (АА17): подруги едут вместе, но
-- прилетают и улетают разными рейсами. Поездка остаётся ОДНА — общий
-- отель, общий план; строки нет — значит «как вся поездка», поэтому
-- бэкфилл не нужен.
CREATE TABLE "TripStay" (
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripStay_pkey" PRIMARY KEY ("tripId","userId")
);

CREATE INDEX "TripStay_userId_idx" ON "TripStay"("userId");

ALTER TABLE "TripStay" ADD CONSTRAINT "TripStay_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripStay" ADD CONSTRAINT "TripStay_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
