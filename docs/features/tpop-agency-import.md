# tpop.fandom: импорт агентства целиком

`/admin/imports` → форма «tpop.fandom: импорт агентства» (URL страницы
вида https://tpop.fandom.com/wiki/RISER_MUSIC) или CLI:
`npx tsx scripts/import-tpop-agency.ts <url>`. Доступ — через
официальный MediaWiki `api.php` (см. [tpop-band-import.md]
(tpop-band-import.md)); контент CC BY-SA, на странице исполнителя
внизу выводится блок «Источники» (сноски References + ссылка на
страницу-источник с пометкой лицензии).

## Что делает (src/lib/tpopAgencyImport.ts)

1. **Агентство**: создаёт/находит по имени (ci), лого из инфобокса —
   только если поле пустое.
2. **Артисты** из секций Groups / Duos / Soloists / Former artists:
   группы (в инфобоксе есть участники) идут через `importTpopBand`,
   солисты матчатся по name/musicAlias/realName (ci) + нормализованный
   фолбэк по realName без дефисов/пробелов («Opas-iamkajorn» ↔
   «Opasiamkajorn»); мимо — создаётся новый. Former artists
   импортируются, но текущим агентством не привязываются.
3. **Расширенный профиль** (`src/lib/tpopArtistExtras.ts`, поля на
   Performer): occupation[], instruments[], soloDebut, height, weight,
   mvAppearances[] (текстом), trivia[], awards (Json-таблица
   year/award/category/nominee/result), references (Json [{label,url}]),
   sourceUrl. Пустые спарсенные значения не затирают ручные.
4. **Дискография**: альбомы/песни через `fetchTpopDiscography`; со
   страниц альбомов/песен берётся обложка и первая «площадочная»
   внешняя ссылка (YouTube/Spotify/Apple, официальный
   `prop=externallinks`) → Album.url / Song.url.
5. **Концерты**: список из секций Concerts/Fanmeetings сверяется с
   афишей (нормализованное сравнение названий): совпадение — артист
   привязывается к событию; нет — поиск на thaiticketmajor
   (`/search?keyword=`), найденное скрейпится `scrapeTtmEvent` и
   создаётся событие с датами/ценой/постером/препродажей. TTM ищет
   только текущие продажи, прошедшие зарубежные фанмиты попадают в
   `concertsNotFound` в summary (события «без даты» не создаём).

## Журнал «последнее спарсенное»

Каждый созданный/обновлённый объект пишется в `ImportedItem`
(runId → ImportRun, entityType, entityId, action, label) — лента на
`/admin/imports` со ссылками на админ-редактирование. Сюда пишут
автоматические импорты; ручное добавление не логируется.

## Вывод на странице исполнителя

Инфо-строки (занятия, инструменты, сольный дебют, рост/вес) + секции
«Появления в клипах», «Награды и номинации» (таблица, Won —
зелёным), «Факты», «Источники» — внизу страницы.

## Слияние дублей

`mergePerformers` переносит и музыку (Album c разрешением конфликта
по (performerId,title) — песни переезжают в одноимённый альбом
выжившего), Song и строки кастомных списков — без этого каскад
удаления проигравшего терял бы их молча.
