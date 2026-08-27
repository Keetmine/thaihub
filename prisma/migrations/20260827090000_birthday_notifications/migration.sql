-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'PERFORMER_BIRTHDAY';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tgNotifyBirthdays" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "BirthdayNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirthdayNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BirthdayNotification_performerId_idx" ON "BirthdayNotification"("performerId");

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayNotification_userId_performerId_year_key" ON "BirthdayNotification"("userId", "performerId", "year");

-- AddForeignKey
ALTER TABLE "BirthdayNotification" ADD CONSTRAINT "BirthdayNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthdayNotification" ADD CONSTRAINT "BirthdayNotification_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

