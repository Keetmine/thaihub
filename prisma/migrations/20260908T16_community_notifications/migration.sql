-- Уведомления сообществ (АА25): приглашение и новая тема обсуждения.
-- Приглашение — единственный путь в закрытое сообщество, поэтому оно
-- полноценное уведомление, а не строка в списке.
ALTER TYPE "NotificationKind" ADD VALUE 'COMMUNITY_INVITE';
ALTER TYPE "NotificationKind" ADD VALUE 'COMMUNITY_POST';

-- Тумблер Telegram: приглашения и решения по заявкам — да, темы
-- обсуждений — нет, их слишком много (см. TELEGRAM_KINDS).
ALTER TABLE "User" ADD COLUMN "tgNotifyCommunities" BOOLEAN NOT NULL DEFAULT true;
