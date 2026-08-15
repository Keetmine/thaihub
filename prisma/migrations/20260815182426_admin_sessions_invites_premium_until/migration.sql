-- AlterTable: вечный boolean становится сроком; действующим подписчикам
-- выдаём месяц от момента миграции, чтобы никто не потерял доступ молча.
ALTER TABLE "User"
ADD COLUMN     "premiumExpiryNotifiedFor" TIMESTAMP(3),
ADD COLUMN     "premiumUntil" TIMESTAMP(3);
UPDATE "User" SET "premiumUntil" = NOW() + INTERVAL '30 days' WHERE "isPremium" = true;
ALTER TABLE "User" DROP COLUMN "isPremium";

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("code")
);

-- AddForeignKey
ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

