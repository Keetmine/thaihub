
-- AlterTable
ALTER TABLE "Pairing" ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "country" TEXT,
ADD COLUMN     "gender" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Pairing_username_key" ON "Pairing"("username");

