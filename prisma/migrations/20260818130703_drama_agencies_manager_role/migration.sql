-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isManager" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DramaAgency" (
    "dramaId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,

    CONSTRAINT "DramaAgency_pkey" PRIMARY KEY ("dramaId","agencyId")
);

-- AddForeignKey
ALTER TABLE "DramaAgency" ADD CONSTRAINT "DramaAgency_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaAgency" ADD CONSTRAINT "DramaAgency_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Переносим существующее одиночное агентство сериала в новую связь.
INSERT INTO "DramaAgency" ("dramaId", "agencyId")
SELECT id, "agencyId" FROM "Drama" WHERE "agencyId" IS NOT NULL
ON CONFLICT DO NOTHING;
