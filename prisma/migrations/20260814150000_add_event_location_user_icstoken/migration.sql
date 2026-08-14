-- AlterTable
ALTER TABLE "Event" ADD COLUMN "locationId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "icsToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_icsToken_key" ON "User"("icsToken");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
