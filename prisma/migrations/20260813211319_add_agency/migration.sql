-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add the new FK column first, backfill it from the old
-- free-text "agency" column, then drop that column (instead of Prisma's
-- default drop+add in one step, which would silently lose the data).
ALTER TABLE "Performer" ADD COLUMN "agencyId" TEXT;

-- Data migration: one Agency row per distinct existing free-text value.
INSERT INTO "Agency" (id, name, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, distinct_agency."agency", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "agency" FROM "Performer" WHERE "agency" IS NOT NULL AND trim("agency") <> '') AS distinct_agency;

UPDATE "Performer" p
SET "agencyId" = a.id
FROM "Agency" a
WHERE a.name = p."agency";

ALTER TABLE "Performer" DROP COLUMN "agency";

-- CreateIndex
CREATE UNIQUE INDEX "Agency_name_key" ON "Agency"("name");

-- AddForeignKey
ALTER TABLE "Performer" ADD CONSTRAINT "Performer_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
