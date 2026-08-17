-- CreateEnum
CREATE TYPE "TripMemberStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- AlterTable
ALTER TABLE "TripMember" ADD COLUMN     "status" "TripMemberStatus" NOT NULL DEFAULT 'PENDING';


-- Существующие участники добавлены до механики инвайтов — считаем принявшими.
UPDATE "TripMember" SET "status" = 'ACCEPTED';
