-- Ссылки агентства (соцсети/сайт) — по образцу PerformerLink.
CREATE TABLE "AgencyLink" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    CONSTRAINT "AgencyLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgencyLink_agencyId_idx" ON "AgencyLink"("agencyId");

ALTER TABLE "AgencyLink" ADD CONSTRAINT "AgencyLink_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
