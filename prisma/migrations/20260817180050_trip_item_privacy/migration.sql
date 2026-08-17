-- AlterTable
ALTER TABLE "TripPersonalEvent" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TripTodo" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

