-- П-3: индексы под фильтры каталога и ILIKE-поиск.
-- Таблицы небольшие (тысячи строк), обычный CREATE INDEX отрабатывает за
-- секунды; CONCURRENTLY в транзакционной миграции недопустим.

-- btree под фильтры/сортировки /search и админских списков
-- (см. src/lib/catalogFilters.ts: year-диапазон + сортировка,
-- country/type/status/network — in-фильтры) и под гостевой список
-- /dramas («свежие по дате эфира»).
CREATE INDEX "Drama_year_idx" ON "Drama"("year");

CREATE INDEX "Drama_status_idx" ON "Drama"("status");

CREATE INDEX "Drama_country_idx" ON "Drama"("country");

CREATE INDEX "Drama_type_idx" ON "Drama"("type");

CREATE INDEX "Drama_network_idx" ON "Drama"("network");

CREATE INDEX "Drama_airedFrom_idx" ON "Drama"("airedFrom");

-- Триграммы под ILIKE-поиск (contains, mode: insensitive) из
-- src/lib/searchWhere.ts: сериал ищется по title/titleRu/nativeTitle/
-- alsoKnownAs, актёр — по name/realName/alsoKnownAs/musicAlias.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Drama_title_trgm_idx" ON "Drama" USING GIN ("title" gin_trgm_ops);

CREATE INDEX "Drama_titleRu_trgm_idx" ON "Drama" USING GIN ("titleRu" gin_trgm_ops);

CREATE INDEX "Drama_nativeTitle_trgm_idx" ON "Drama" USING GIN ("nativeTitle" gin_trgm_ops);

CREATE INDEX "Drama_alsoKnownAs_trgm_idx" ON "Drama" USING GIN ("alsoKnownAs" gin_trgm_ops);

CREATE INDEX "Performer_name_trgm_idx" ON "Performer" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "Performer_realName_trgm_idx" ON "Performer" USING GIN ("realName" gin_trgm_ops);

CREATE INDEX "Performer_alsoKnownAs_trgm_idx" ON "Performer" USING GIN ("alsoKnownAs" gin_trgm_ops);

CREATE INDEX "Performer_musicAlias_trgm_idx" ON "Performer" USING GIN ("musicAlias" gin_trgm_ops);

-- GIN по массивам под hasEvery/hasSome-фильтры жанров и тегов
-- (@> и && используют этот индекс).
CREATE INDEX "Drama_genres_gin_idx" ON "Drama" USING GIN ("genres");

CREATE INDEX "Drama_tags_gin_idx" ON "Drama" USING GIN ("tags");
