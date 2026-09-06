-- Когда локация привязана к сериалу — для ленты «что нового» на главной
-- («у сериала появились места съёмок»). Существующие связи заполняем
-- датой самой локации: это ближайшее к правде, что у нас есть, и лента
-- сразу после выкатки не выглядит так, будто весь каталог завели вчера.
ALTER TABLE "DramaLocation" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "DramaLocation" dl
SET "createdAt" = l."createdAt"
FROM "Location" l
WHERE l.id = dl."locationId";

CREATE INDEX "DramaLocation_createdAt_idx" ON "DramaLocation"("createdAt");
