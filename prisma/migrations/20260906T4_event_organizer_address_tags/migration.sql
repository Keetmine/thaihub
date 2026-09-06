-- Организатор, адрес, ссылка на карту и теги события отдельными полями
-- (правка владельца 2026-09-06): раньше краулер фестивалей складывал
-- организатора и жанры строкой в описание.
ALTER TABLE "Event" ADD COLUMN "organizer" TEXT;
ALTER TABLE "Event" ADD COLUMN "address" TEXT;
ALTER TABLE "Event" ADD COLUMN "mapsUrl" TEXT;
ALTER TABLE "Event" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
