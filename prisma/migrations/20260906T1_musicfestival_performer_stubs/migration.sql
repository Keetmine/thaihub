-- Краулер фестивалей musicfestival.in.th (docs/features/musicfestival-import.md):
-- адрес страницы артиста-источника (ключ повторного матчинга лайнапов и
-- строка в «Источниках») и флаг «заготовка» — запись заведена парсером с
-- одним именем и ждёт, когда владелец её дополнит.
ALTER TABLE "Performer" ADD COLUMN "musicFestivalUrl" TEXT;
ALTER TABLE "Performer" ADD COLUMN "stub" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Performer_musicFestivalUrl_key" ON "Performer"("musicFestivalUrl");
