-- AlterTable
ALTER TABLE "EventPhoto" DROP COLUMN "caption",
DROP COLUMN "kind";

-- DropEnum
DROP TYPE "EventPhotoKind";

