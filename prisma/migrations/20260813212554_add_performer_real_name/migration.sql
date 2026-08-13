-- AlterTable
ALTER TABLE "Agency" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Performer" ADD COLUMN     "realName" TEXT;
