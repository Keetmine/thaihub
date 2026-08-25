-- CreateEnum
CREATE TYPE "TripItemVisibility" AS ENUM ('PRIVATE', 'PARTICIPANTS', 'FRIENDS', 'PUBLIC');

-- AlterTable
ALTER TABLE "TripBooking" ADD COLUMN     "visibility" "TripItemVisibility" NOT NULL DEFAULT 'PARTICIPANTS';

-- AlterTable
ALTER TABLE "TripPersonalEvent" ADD COLUMN     "visibility" "TripItemVisibility" NOT NULL DEFAULT 'PARTICIPANTS';

-- AlterTable
ALTER TABLE "TripTodo" ADD COLUMN     "visibility" "TripItemVisibility" NOT NULL DEFAULT 'PARTICIPANTS';


-- Переносим то, что уже отмечено приватным: без этого запись, которую
-- человек когда-то спрятал от участников, при переходе на visibility
-- молча открылась бы им.
UPDATE "TripTodo" SET "visibility" = 'PRIVATE' WHERE "isPrivate" = true;
UPDATE "TripPersonalEvent" SET "visibility" = 'PRIVATE' WHERE "isPrivate" = true;
