
-- DropIndex
DROP INDEX "Pairing_username_key";

-- AlterTable
ALTER TABLE "Pairing" DROP COLUMN "username";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

