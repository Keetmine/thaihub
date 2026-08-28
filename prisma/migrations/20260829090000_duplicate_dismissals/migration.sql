-- CreateTable
CREATE TABLE "DuplicateDismissal" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "memberKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateDismissal_entityType_memberKey_key" ON "DuplicateDismissal"("entityType", "memberKey");

