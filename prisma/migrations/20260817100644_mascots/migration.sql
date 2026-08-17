-- AlterEnum
ALTER TYPE "PerformerType" ADD VALUE 'MASCOT';

-- CreateTable
CREATE TABLE "MascotOwner" (
    "id" TEXT NOT NULL,
    "mascotId" TEXT NOT NULL,
    "performerId" TEXT,
    "pairingId" TEXT,

    CONSTRAINT "MascotOwner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MascotOwner_mascotId_idx" ON "MascotOwner"("mascotId");

-- CreateIndex
CREATE INDEX "MascotOwner_performerId_idx" ON "MascotOwner"("performerId");

-- CreateIndex
CREATE INDEX "MascotOwner_pairingId_idx" ON "MascotOwner"("pairingId");

-- AddForeignKey
ALTER TABLE "MascotOwner" ADD CONSTRAINT "MascotOwner_mascotId_fkey" FOREIGN KEY ("mascotId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MascotOwner" ADD CONSTRAINT "MascotOwner_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MascotOwner" ADD CONSTRAINT "MascotOwner_pairingId_fkey" FOREIGN KEY ("pairingId") REFERENCES "Pairing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

