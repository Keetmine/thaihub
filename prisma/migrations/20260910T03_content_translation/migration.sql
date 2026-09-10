-- Правимый словарь повторяющихся значений из импорта (жанры, страны,
-- типы, занятия, инструменты) — правка владельца 2026-09-10: «выведем в
-- настройки, чтобы я могла сама менять переводы».
--
-- В коде остаются значения по умолчанию, здесь — только то, что владелец
-- поправила или добавила. `source` хранится в НИЖНЕМ регистре: источники
-- пишут одно и то же вразнобой («Actor» и «actor»).
CREATE TABLE "ContentTranslation" (
  "id"        TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "source"    TEXT NOT NULL,
  "ru"        TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentTranslation_kind_source_key"
  ON "ContentTranslation"("kind", "source");
