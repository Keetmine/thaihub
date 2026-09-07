-- Блокировка пользователя (решение владельца 2026-09-09).
--
-- До этого у владельца сайта не было рычага вовсе: мягкое удаление
-- аккаунта — действие самого человека, а не инструмент модерации.
-- Написанное забаненным остаётся: массовое исчезновение чужих реплик
-- рвёт разговоры, точечно удаляет админ.
ALTER TABLE "User" ADD COLUMN "bannedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;
ALTER TABLE "User" ADD COLUMN "bannedById" TEXT;
CREATE INDEX "User_bannedById_idx" ON "User"("bannedById");
ALTER TABLE "User" ADD CONSTRAINT "User_bannedById_fkey"
  FOREIGN KEY ("bannedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
