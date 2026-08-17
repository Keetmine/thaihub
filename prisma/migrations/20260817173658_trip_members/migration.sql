-- AlterTable
ALTER TABLE "TripPersonalEvent" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "editableByOthers" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TripTodo" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "editableByOthers" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TripMember" (
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("tripId","userId")
);

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

