-- Переводы уникальных текстов сущностей (правка владельца 2026-09-10:
-- «ру перевод нужен не только сериалам, и переводить не только описание,
-- а все поля»).
--
-- ОДНА колонка-Json на сущность, а не колонка на поле: переводимых
-- полей у артиста восемь, у события четыре, и половина из них —
-- массивы (факты, награды, клипы). Двадцать колонок `*Ru` пришлось бы
-- заводить миграцией на каждое новое поле, а тут форма и читалка
-- работают по одному объявлению в коде (src/lib/entityTranslations.ts).
--
-- Форма значения: { "ru": { "bio": "…", "trivia": ["…"] } } — язык
-- верхним ключом, чтобы завтрашний второй язык не потребовал ещё одной
-- миграции. Пусто (NULL) — переводов нет, показывается оригинал.
--
-- Drama сюда НЕ входит: у неё titleRu/synopsisRu заведены раньше,
-- заполняются импортом с dorama.land и читаются через lib/dramaLocale.
ALTER TABLE "Performer" ADD COLUMN "translations" JSONB;
ALTER TABLE "Event"     ADD COLUMN "translations" JSONB;
ALTER TABLE "Location"  ADD COLUMN "translations" JSONB;
ALTER TABLE "Novel"     ADD COLUMN "translations" JSONB;
ALTER TABLE "Agency"    ADD COLUMN "translations" JSONB;
