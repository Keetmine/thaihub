-- Бессрочная подписка: админ выдаёт друзьям/команде, чтобы не продлевать
-- каждый месяц. premiumUntil при этом не трогается — снятие флага
-- возвращает обычный срок.
ALTER TABLE "User" ADD COLUMN "premiumLifetime" BOOLEAN NOT NULL DEFAULT false;
