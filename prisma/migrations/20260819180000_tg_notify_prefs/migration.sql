
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tgNotifyEvents" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tgNotifyFriends" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tgNotifyInvites" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tgNotifyReplies" BOOLEAN NOT NULL DEFAULT true;

