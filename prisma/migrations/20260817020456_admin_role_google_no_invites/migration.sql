-- DropForeignKey
ALTER TABLE "InviteCode" DROP CONSTRAINT "InviteCode_usedById_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "AdminSession";

-- DropTable
DROP TABLE "InviteCode";

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

