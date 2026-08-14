-- CreateEnum
CREATE TYPE "PairingStatus" AS ENUM ('CURRENT', 'PAST');

-- AlterTable
ALTER TABLE "Pairing" ADD COLUMN     "status" "PairingStatus" NOT NULL DEFAULT 'CURRENT';
