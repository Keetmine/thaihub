-- Тексты уведомлений правятся из админки (просьба владельца 2026-09-23:
-- «все подписи выведем в админке, чтоб можно было там же и править;
-- вообще все шаблоны уведомлений было б прикольно редактировать»).
--
-- Хранятся ТОЛЬКО переписанные строки: всё остальное читается из
-- словаря, как и раньше, а «сбросить» — это удалить строку. Ключ — из
-- реестра NOTIFICATION_TEMPLATES (src/lib/notificationTemplates.ts),
-- locale — язык, на котором написан текст: у каждого языка свой.
CREATE TABLE "NotificationTemplate" (
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("key", "locale")
);
