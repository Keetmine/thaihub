-- Уникализация текстов каталога (просьба владельца 2026-09-23: описания
-- сериалов и биографии артистов дословно повторяли MyDramaList).
--
-- Таблица хранит оригинал рядом с переписанным: откат — это запись
-- original назад. Она же отметка «текст наш»: повторный прогон такие
-- записи пропускает, а ночной синк с MDL их и так не трогает (он
-- дозаполняет только пустые поля, см. lib/mdlDramaImport.ts).
CREATE TABLE "TextRewrite" (
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "original" TEXT,
    "rewritten" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TextRewrite_pkey" PRIMARY KEY ("entity", "entityId", "field")
);

CREATE INDEX "TextRewrite_entity_field_idx" ON "TextRewrite"("entity", "field");
