
-- CreateEnum
CREATE TYPE "ScheduleTargetMode" AS ENUM ('ALL', 'SELECTED');

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hour" INTEGER NOT NULL DEFAULT 4,
    "targetMode" "ScheduleTargetMode" NOT NULL DEFAULT 'ALL',
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastSummary" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ScheduledJobTarget" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    CONSTRAINT "ScheduledJobTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledJob_enabled_idx" ON "ScheduledJob"("enabled");

-- CreateIndex
CREATE INDEX "ScheduledJobTarget_jobKey_idx" ON "ScheduledJobTarget"("jobKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJobTarget_jobKey_performerId_key" ON "ScheduledJobTarget"("jobKey", "performerId");

-- AddForeignKey
ALTER TABLE "ScheduledJobTarget" ADD CONSTRAINT "ScheduledJobTarget_jobKey_fkey" FOREIGN KEY ("jobKey") REFERENCES "ScheduledJob"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJobTarget" ADD CONSTRAINT "ScheduledJobTarget_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

