-- CreateTable
CREATE TABLE "PerformerAgency" (
    "performerId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformerAgency_pkey" PRIMARY KEY ("performerId","agencyId")
);

-- Data migration: preserve every performer's existing single agency as a
-- join row before dropping the column it came from.
INSERT INTO "PerformerAgency" ("performerId", "agencyId")
SELECT "id", "agencyId" FROM "Performer" WHERE "agencyId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Performer" DROP CONSTRAINT "Performer_agencyId_fkey";

-- AlterTable
ALTER TABLE "Performer" DROP COLUMN "agencyId";

-- AddForeignKey
ALTER TABLE "PerformerAgency" ADD CONSTRAINT "PerformerAgency_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformerAgency" ADD CONSTRAINT "PerformerAgency_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
