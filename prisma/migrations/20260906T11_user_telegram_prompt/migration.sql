-- Предложение привязать Telegram тем, кто зарегистрировался почтой:
-- помним, что уже показывали, чтобы не спрашивать дважды.
ALTER TABLE "User" ADD COLUMN "telegramPromptedAt" TIMESTAMP(3);
