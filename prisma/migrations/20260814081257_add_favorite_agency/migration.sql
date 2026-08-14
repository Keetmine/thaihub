-- CreateTable
CREATE TABLE "FavoriteAgency" (
    "userId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteAgency_pkey" PRIMARY KEY ("userId","agencyId")
);

-- AddForeignKey
ALTER TABLE "FavoriteAgency" ADD CONSTRAINT "FavoriteAgency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteAgency" ADD CONSTRAINT "FavoriteAgency_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
