# Catalog: performers, pairings, dramas, agencies

**Ячейка статуса в таблицах** оформляется общим правилом
`.table-status-cell` в globals.css — им пользуются и каталог `/dramas`,
и вкладка «Сериалы» в профиле. Раньше стили жили в CSS-модуле каталога,
и тот же селект в профиле выглядел голой рамкой (правка владельца
2026-09-06). Ширины колонок у обеих таблиц тоже одинаковые: в узкой
подпись «Смотрю сейчас» обрезалась многоточием.

## Performers & bands

One `Performer` model covers both solo actors and bands
(`type: SOLO | BAND`). Public: `src/app/(public)/artists/` (list +
`[id]` detail, `?view=agencies` — see below). Admin:
`src/app/admin/(protected)/performers/` (`PerformerForm.tsx`,
`AdminPerformerTabs.tsx` for the Актёры/Группы/Пейринги/Агентства tab
bar).

- A `BAND` performer's roster is other `Performer` rows linked through
  `BandMember` — an idol who's both in a group and individually credited
  in a drama is one `Performer` row, referenced both directly and as a
  band member. A band's current lineup, bio, photo, and label (as an
  `Agency`) can be pulled from tpop.fandom.com — see
  [tpop-band-import.md](tpop-band-import.md).
- Real name, birth date, place of birth, bio, agency, photo, MyDramaList
  link are all optional profile fields, fillable manually or (for dramas)
  picked up via the blscene importer's cast data where available. Real
  name, birth date, bio, photo, social links and filmography can be
  pulled per person from MyDramaList — see
  [mydramalist-import.md](mydramalist-import.md). Bulk TMDB/GMMTV sweeps
  were removed; point imports from TMDB remain — see
  [tmdb-import.md](tmdb-import.md).
- **Public performer URLs**: `/artists/{slug}` (см. slugs.md; раздел
  переименован из /performers — старые ссылки редиректятся навсегда
  через next.config) — `performerHref()` in
  `src/lib/performerSlug.ts` builds the link everywhere one is needed,
  `parsePerformerIdFromParam()` strips the slug back off on the way in.
  The id (a Prisma cuid, never containing a hyphen) is always the real
  identifier; the slug is purely decorative and ignored on lookup, so a
  bare `/performers/{id}` still resolves and a stale slug in an old
  bookmark never breaks. Falls back to a bare id link when there's
  nothing Latin-script to slugify (a Thai-only name with no romanized
  form).
- Страница артиста `[id]` — классическая шапка, как у сериала (по
  фидбеку владельца, без `DetailHero`): имя с realName в скобках
  прямо в h1 (`fs-5 fw-normal text-secondary`), кнопки справа — без
  ряда чипов (агентство и так в фактах, а счётчики путают: в них
  попадают прошедшие события); ниже фото 15rem слева
  (`performerPhoto`-фолбэк; без фото факты занимают всю ширину) с
  соцссылками под ним, справа факты и био просто текстом — без
  фона-карточки. Длинное био (>300 символов) свёрнуто в
  `details.synopsis-fold` («Читать дальше»), как синопсис сериала.
  Вертикальные списки раскрываются целиком — без внутреннего скролла;
  исключение одно, **песни**: у музыканта их бывает под полсотни, и
  страница уходила в бесконечность (жалоба владельца на
  `/artists/1mill`). Видны первые 12, хвост — по кнопке «Показать все
  (N)» (`artists/[id]/ListFold.tsx`, манера `TagRowFold`: обе половины
  приходят с сервера, клиент только переключает, замеров высоты нет —
  они дают моргание). Хвост в одну-две строки не прячется: кнопка
  заняла бы столько же места. Остальным спискам страницы свёртка не
  нужна — альбомы лежат горизонтальным `poster-row` со своим скроллом,
  а клипов, наград и фактов у самых полных профилей по 7–10 строк.
  Сериалы — анонсы первыми (PLANNED /
  IN_PRODUCTION / PILOT или дата старта в будущем; ближайшая премьера
  сверху, бездатные анонсы в конце блока), дальше вышедшие в порядке
  выхода (полная дата `airedFrom`, не голый год), свежие сверху;
  записи вовсе без дат — в самом низу. Фильмография — под-табами
  Сериалы/Фильмы/Шоу (`SubTabs variant="bar"` — стандартные
  подчёркнутые вкладки, как на /events; в профиле тот же компонент
  остаётся пилюлями). Деление по `Drama.type`, запись без типа —
  сериал; пустые типы вкладок не получают.
- **Дубли соцссылок.** Один профиль приходит в разной форме:
  `instagram.com/x` из одного источника и `www.instagram.com/x/` из
  другого. И импорт с MDL, и форма в админке сравнивали адреса
  буквально, поэтому заводили две записи, и на странице артиста
  иконка сети показывалась дважды. Оба места теперь сравнивают по
  `socialLinkKey` (`src/lib/socialLinks.ts`): гасятся схема, `www.`,
  хвостовой слеш, query и регистр, а `twitter.com` и `x.com` считаются
  одним аккаунтом. Уже накопленное чистит разовый
  `scripts/dedupe-performer-links.ts` (по умолчанию — черновой прогон,
  `--apply` удаляет; из группы остаётся запись с протоколом и
  осмысленной подписью).
- `PerformerLink` is a free-form label+URL list per performer (social
  media, personal café, whatever) — no schema change needed to add a new
  kind of link. `src/lib/socialLinks.ts`'s `detectSocialPlatform(url)`
  recognizes Instagram/TikTok/Twitter/Facebook (плюс музплощадки и
  YouTube) by host regardless of what label an
  import or admin gave the row — used to (a) show those (plus
  `mydramalistUrl`) as branded icon buttons under a performer's photo via
  `SocialLinkIcons`, everything else still a plain labeled pill, and (b)
  give `PerformerForm` dedicated per-platform fields
  instead of lumping them into the generic add-a-link list — purely a
  form-UI split, `getLinks` in `performers/actions.ts` merges them back
  into the same `PerformerLink` rows on save, no separate schema field.
  The same detection drives agency links on the public agency page.
- The admin performers list (`/admin/performers`) is a flat, paginated
  list (see "Catalog scale" below) with a `NameSearchBox` search and a
  photo per row, edit/delete icon buttons instead of a favorite toggle.
  Флаг «Заготовки парсеров (без данных)» в панели фильтров (`?stub=1`)
  показывает записи, заведённые краулером фестивалей с одним именем
  (`Performer.stub`); сохранение профиля снимает флаг — см.
  [musicfestival-import.md](musicfestival-import.md).

## Карточка сериала: блок фактов

Страна, тип и теги (И4) показываются только при заполненном
значении — у записей до переимпорта страна и тип пусты, а «Страна: —»
на четырёх тысячах карточек хуже отсутствия строки. Значения не
переводятся (данные каталога) и ведут ссылками в /search с
соответствующим фильтром. Канал, режиссёр и сценарист из карточки
убраны (просьба владельца) — в данных остаются, фильтр по каналу в
/search работает.

Теги — обычным текстом в цвет `.tag-chip` (`.tag-link`), не чипами:
у MDL их десятки, и чипы раздували карточку. Сервер рендерит первые
шесть, дальше неброское «ещё N» (`.tag-more-link`) сразу за последним
тегом — по клику разворачивается хвост (`TagRowFold`). Именно счётчик,
а не замер высоты: первая версия мерила строку в useEffect, и страница
мигала — SSR-кадр показывал все теги, потом клиент их прятал; вторая
беда замера — кнопка вставала у правого края строки. Жанры остались
чипами.

Блок «Источники» — ВСЕГДА самый нижний на странице (решение владельца;
закреплено комментарием в `SourcesBlock.tsx`) — ниже отзывов,
комментариев и «Вам может понравиться». То же на странице события и
агентства.

## Порядок секций страницы сериала

Факты → актёрский состав → связанные сериалы → события (фан-миты,
премьеры) → локации → источники → отзывы → «Вам может понравиться».
События опущены ниже каста и связанных по просьбе владельца.

## Похожие сериалы (З4)

Блок «Вам может понравиться» на странице сериала
(`findSimilarDramas` в `src/lib/similarDramas.ts`): рекомендации по
пересечению каста и жанров/тегов. Скоринг: общий актёр — 3 очка, общий
жанр — 1, общий тег — 1 (тегов не больше трёх: у MDL их десятки, и
длинные списки перевешивали бы каст); порог 2 отсекает совпадение по
одному дежурному жанру («Romance» есть почти у всего каталога); ничьи
решает оценка MDL. Блок стоит В САМОМ НИЗУ страницы, после отзывов и
комментариев (просьба владельца): дочитал — вот куда идти дальше.
Карточки как у сериалов на странице артиста (постер 2:3, название,
год, кнопка статуса просмотра), но сеткой `row` на всю ширину, без
горизонтального скролла. Причина рекомендации не показывается (просьба
владельца) — скоринг остаётся внутренним. Сиквелы и прочий
Related Content с MDL исключены — они выше своим блоком. Коллаборативной
фильтрации нет намеренно: не из чего строить, а общий актёр в BL-нише —
самый сильный сигнал.

**Кандидаты — SQL-предфильтром, результат — в кэше.** Раньше `findMany`
с OR по `hasSome` жанров/тегов вытягивал почти весь каталог на каждый
просмотр («Romance» есть у всего). Теперь кандидатов отбирает сырой
запрос с тем же условием, что финальный порог (score ≥ 2: актёр ×3 +
жанры + теги max 3), с ORDER BY по тому же скорингу и LIMIT 400 —
лимит срезает заведомо худший хвост, а не случайное подмножество.
Итог обёрнут в `unstable_cache` (TTL 30 мин, тег `catalog` — правка
каталога сбрасывает раньше); аргументы функции входят в ключ, так что
запись по одной на сериал.

## Shared A-Z index layout

`src/components/AlphabetIndexList.tsx` groups any `{id, name}[]` list by
first letter (digits collapse into one "0-9" group) and renders a
letter rail pinned to the right (`.performers-layout` /
`.performers-index` in `globals.css`) — used by the public and admin
performers lists, `/dramas`, `/locations` (alphabetical view), and
`/locations?group=drama` (grouping *dramas* alphabetically, each
`renderItem` rendering that drama's own location list). An optional
`trailingSection` renders one extra, ungrouped section after the letter
groups with its own short index-nav symbol — used by the locations
drama-grouped view for "Без сериала" (locations with no linked drama).

**Сама рейка — один компонент `AlphabetRail`** (2026-08-29): до него
каждый список рисовал её сам, и два из трёх заворачивали букву в лишний
span с полным кеглем страницы — строка выходила 24px против 16.8 у
сериалов, и рейки соседних страниц выглядели по-разному. Пропсы:
`pinned` (якорь-сердечко избранного перед буквами), `trailing` (якорь
после), `onLetter` (порционные списки раскрывают строки до буквы, иначе
якорь ведёт в пустоту). Шаг строки после объединения — 20.4px везде.

**Краулабельные буквы и серверные страницы буквы (С-5).** Краулер без
JS видел десятки ссылок из тысяч записей — клиентские списки дорисовывают
строки на скролле. Поэтому у рейки есть проп `letterHrefBase`
(прокидывается через `AlphabetDataList`/`AlphabetIndexList` с `/artists`,
`/dramas` и `/locations`): буква становится настоящей ссылкой
`?letter=X`, но клик живого зрителя перехватывается (preventDefault +
scrollIntoView) — UX не меняется, роботы идут по href. По адресу
`?letter=X` (валидные буквы — `CATALOG_LETTERS` в
`src/lib/catalogLetters.ts`: латиница + «0-9») страница рендерит
серверную версию: полный список записей буквы обычными ссылками, нав по
всем буквам и ссылку назад на полный каталог; canonical у страницы буквы
самоссылающийся (`?letter` входит в `path` для `pageMetadata`). Выборки
буквы кэшируются (тег `catalog`, TTL 30 мин). Кириллическая буква в
`?letter` (возможна на /ru у рейки сериалов с русскими названиями)
просто игнорируется — рендерится обычная страница.

Списки скроллятся **целиком окном** — внутреннего скролл-контейнера
(бывшие `.scroll-list-lg`/`.thin-scroll` на обёртке) больше нет, по
фидбеку владельца. Чтобы рейка букв оставалась под рукой, она липнет к
вьюпорту (`position: sticky; top: 6rem` + `height: calc(100vh - 8rem)`
в globals), а буквы стоят **сверху колонки** — от начала зоны списка:
`justify-content: flex-start` из co-located `AlphabetRail.module.css`
(селектор `nav.rail` перебивает `justify-content: center` глобального
`.performers-index` при любом порядке чанков; globals в тот момент был
занят). История правок, чтобы не ходить по кругу:
сначала было центрирование через `top: 50vh` +
`transform: translateY(-50%)` — трансформа не ограничена контейнером и
поднимала рейку выше её колонки, буквы ложились поверх шапки
`/locations`; потом `justify-content: center` внутри колонки — при
коротком списке (маскоты, отфильтрованная вкладка) буквы висели по
центру экрана далеко ЗА списком (жалоба владельца 2026-09-04), а при
переполненной колонке center вдобавок обрезал верхние буквы
недосягаемо для скролла. Если будете править — проверяйте, что верх
рейки не выше верха `.performers-layout`, на длинном И коротком
списках. Якоря `#letter-X` скроллят окно;
`.performers-letter-section` несёт `scroll-margin-top: 6rem`, чтобы
заголовок буквы не нырял под навбар.

`/dramas` рендерит записи **строками** — не постерной сеткой: в
каталоге много одиночных сериалов, карточки ели место, а длинные
названия обрезались. Строка **компактная, «аля таблица»** (правка
владельца 2026-09-05 поверх компактной строки 2026-09-04): мелкая
миниатюра постера 1.7×2.3rem с фолбэк-буквой, название и «★ рейтинг»
одним потоком текста (год из подстроки убран — у него своя колонка;
короткое название — одна строка; длинное клампится на двух), у
выходящих (`Drama.status === RETURNING_SERIES`) — бейдж «Выходит»
сразу за названием. Карандаша `DramaStatusButton` у названия больше
нет (правка владельца 2026-09-06): он дублировал колонку статуса, ради
которой таблица и затевалась — статус правится прямо в ней
(`DramaStatusSelect` — подпись статуса, по клику раскрывающая наш
обычный дропдаун `.performer-select-dropdown` порталом в body; нативный
`<select>` был первой версией и владельцу не понравился: его список
рисует ОС, и на тёмной теме он выпадал из оформления. Гостю селект не
показывается — он всё равно уехал бы на вход). Справа жёсткие колонки: статус просмотра · тип
(`t.catalog.dramaType`, перевод свободной строки `Drama.type` с MDL) ·
год · страна (`t.catalog.dramaCountry`) · прогресс «2/10»
(`EpisodeProgress variant="inline"`: тихий счётчик без плашки, кнопки
−/+ проявляются на ховере строки, прогресс-бара в списке нет — бар
остался только у `variant="full"` на странице сериала; число здесь
ПРОСТО ТЕКСТ — правка владельца 2026-09-06: рамка инпута посреди
«3/10» смотрелась криво, менять можно кнопками, а поле ввода осталось
на странице сериала, где им и пользуются). На <992px
колонки, кроме прогресса, скрыты. Гостевой кэш выборки —
`dramas-guest-list-v2` (ключ сменён вместе с составом полей). Вся
геометрия — в co-located `src/app/(public)/dramas/dramas.module.css`.

**Сортировка — шапкой самой таблицы** (правка владельца 2026-09-06:
«не отдельным фильтром, а как на самой таблице»). Над строками ряд
названий колонок-ссылок; клик даёт три состояния по кругу: по
возрастанию → по убыванию → без сортировки. Состояние живёт в адресе
(`?sort=year&dir=desc`), поэтому работает без JS, переживает
перезагрузку и делится ссылкой; адрес собирается от текущих параметров
(`adminListHref`), так что поиск и вкладка статуса не теряются.
Считается сортировка в JS, а не запросом: две колонки из шести — «мои»
(статус просмотра и просмотренные серии), они живут в
`DramaWatchStatus` и приезжают картой; список тут в сотни строк, не в
тысячи. Пустые ячейки всегда внизу — и по возрастанию, и по убыванию,
иначе разворот показывал бы полтаблицы пустых; равные значения
доупорядочиваются по названию, чтобы строки не прыгали. Подписи
колонок — `t.catalog.dramaColumns`, общие с таблицей вкладки «Сериалы»
в профиле (таблицы задуманы роднёй; см. [social.md](social.md)).

**Букв на /dramas больше нет** (правка владельца 2026-09-06): ни
жёлоба слева, ни рейки справа — каталог читается сплошной таблицей, а
порядок задаёт её шапка. Вместе с ними ушли обёртка `.compact` и
правила под `AlphabetIndexList` в `dramas.module.css`; артисты и
локации остались на общих правилах `globals.css` со своими буквами.
Серверные страницы буквы (`?letter=X`) живы — они нужны краулеру для
перелинковки и рисуются на самой странице своей разметкой.

## Catalog scale

The performer/drama catalog grew into the thousands (bulk TMDB sync +
Wikipedia agency imports) — rendering every row on one page stopped being
viable. Public and admin list pages handle this differently, since
they're solving different problems:

- **Public `/performers` and `/dramas`**: without a search term, the
  page doesn't query the full catalog at all — only rows already
  favorited (performers) or marked with some `DramaWatchStatus`
  (dramas — drama favorites don't exist, see [social.md](social.md))
  are shown, so a signed-in user's own list stays small regardless of
  catalog size. Empty state points at the search box
  ("Используйте поиск, чтобы найти актёра/сериал") rather than showing
  nothing with no explanation. Typing a search term switches to a real
  catalog-wide query, capped at `SEARCH_RESULT_LIMIT` (100,
  `src/lib/pagination.ts`) — a short/common query (a single letter)
  can still match thousands of rows in a catalog this size. The cap is
  silent by design: it used to be announced ("showing the first 100…",
  "search covers the whole catalogue"), and both notices were removed —
  a visitor who typed one letter does not need telling that a hundred
  results is a lot. No page-number pagination here — narrowing the
  search is the intended way to get to a specific entry.
- **Кэш общих выборок (П-1)**: всё, что одинаково для всех зрителей,
  обёрнуто в `unstable_cache` (TTL 15–30 мин, тег `catalog` — любая
  админская правка каталога сбрасывает его через `logAudit` →
  `invalidateCatalogCache` в `src/lib/catalogCache.ts`): лендинг гостя
  (`LandingPage.tsx` — ближайшие события и счётчики), «выходит сегодня»
  и дни рождения артистов на главной (день входит в ключ), гостевые
  списки `/artists` (событийные актёры с картинкой — ключ
  `artists-with-events-v2`, полные списки групп/маскотов,
  агентства), гостевой список `/dramas` (свежие 60), список `/novels`,
  каталожный список `/locations` (категория в ключе), подложки имён
  всех разделов и страницы буквы `?letter=X`. Персональные ветки
  (избранное, статусы просмотра, «была здесь», свои списки) остаются
  живыми запросами — внутри `unstable_cache` нельзя звать
  `cookies()`/`getCurrentUser`. Даты из кэша приходят строками
  (значение сериализуется) — потребители возвращают их в `Date` руками.
- **Индексы под фильтры и поиск** (миграция
  `20260830190000_search_and_filter_indexes`): btree по
  `Drama.year/status/country/type/network` (фильтры и сортировки
  `catalogFilters.ts`) и `Drama.airedFrom` (гостевой список); GIN
  `gin_trgm_ops` (расширение `pg_trgm`) по полям ILIKE-поиска из
  `searchWhere.ts` — `Drama.title/titleRu/nativeTitle/alsoKnownAs`,
  `Performer.name/realName/alsoKnownAs/musicAlias`; GIN по массивам
  `Drama.genres`/`Drama.tags` (hasEvery/hasSome).
- **Admin list pages** (`/admin/performers`, `/admin/dramas`,
  `/admin/locations`, `/admin/pairings`, `/admin/agencies`, the
  `/admin` events dashboard): plain
  `?page=` pagination, `PAGE_SIZE` (30, same `src/lib/pagination.ts`)
  rows per page via Prisma `skip`/`take`, with a `<Pagination>`
  (`src/components/Pagination.tsx`) prev/next + "Стр. X из Y" footer —
  a full numbered page list isn't practical once a catalog runs into
  the hundreds of pages. The admin events dashboard is the one
  exception that can't paginate at the query level: it sorts by each
  event's first occurrence date, which only exists once every event's
  `EventOccurrence` rows are loaded, so it fetches everything, sorts in
  JS, then slices — fine given the event count is nowhere near
  performer/drama scale.

## Имена за шапкой раздела

За заголовком каждого витринного раздела лежат ряды реальных имён
раздела (компонент `PageHeader`, проп `watermarkNames`, оформление —
[design-system.md](../design-system.md)). Страница отдаёт плоский список
**в порядке убывания популярности**, максимум `WATERMARK_NAME_LIMIT`
имён; раскладку по рядам и обрезку длинных названий делает сам
компонент. Метрика популярности у каждого раздела своя:

| Страница | Что показываем | Метрика |
| --- | --- | --- |
| `/artists` | исполнители текущей вкладки (актёры/группы/маскоты), на вкладке агентств — агентства | число `FavoritePerformer` / `FavoriteAgency`, вторым ключом — число событий |
| `/dramas` | сериалы | число `DramaWatchStatus` (сердечка у сериала нет), вторым ключом — свежесть эфира |
| `/events` | события | число `EventAttendance` («иду»), вторым ключом — `FavoriteEvent` |
| `/locations` | места каталога (без созданных пользователями) | число `LocationVisit` («была здесь»), вторым ключом — в скольких сериалах засветилось |
| `/novels` | новеллы | внятной метрики нет (ни избранного, ни статусов) — берём свежедобавленные |
| `/trips` | — | кабинетный раздел, имён нет: остаётся контурное слово `watermark` |

Выборка везде — один `findMany` на «только имя» с `take`, поэтому
сортировка по счётчику связи стоит один агрегат и не зависит от размера
каталога. Коротких списков подложка не боится: если имён на четыре ряда
не хватает (маскоты — их пара, новеллы), `PageHeader` пускает список по
кругу и всё равно заполняет ряды. На контурное слово шапка откатывается
только тогда, когда имён нет вовсе (пустая база, кабинетные разделы).

## Подпись справа от заголовка (актёры, сериалы)

Правее заголовка на `/artists` и `/dramas` стоит `.hero-note` — три
строки, по абзацу на каждую: две серые (`heroLead1` + `heroLead2`) и
акцентная третья (`heroCta`). Ключи свои у каждого раздела:
`catalog.artists.*` («избранные и артисты» / «с событиями в афише.» /
«нет в списке — ищите по имени.»; **событие само по себе в список не
пускает** — правка владельца 2026-09-06: нужна ещё картинка, своё фото
или обложка релиза, то есть ровно то, что рисует `performerPhoto`,
иначе строка была бы пустой плиткой с буквой. Условие
`HAS_PHOTO_WHERE` в `artists/page.tsx`; избранное показывается
независимо от фото — это явный выбор человека, а поиск по-прежнему
находит всех) и `catalog.dramas.*` («здесь только
сериалы,» / «которые вы отметили.» / «нет в списке — ищите по
названию.»). Перенос первой реплики прибит разметкой, поэтому ключей
три, а не два — в обоих языках. На актёрах подпись заменила прежний
серый абзац-подсказку под вкладками. Условие показа общее — только без
поискового запроса (в результатах поиска виден весь каталог, и
утверждение было бы неправдой); на актёрах к этому добавлена вкладка
актёров: на группах, маскотах и агентствах оно тоже было бы неправдой.

## Music

A performer has a music side, solo or as a band: `Performer.musicAlias`
(сценический псевдоним сольного музыканта, shown as «Выступает как» on
the performer page and editable in the admin form), a discography
(`Album` — type ALBUM/EP/SINGLE, year, locally-stored cover; `Song` —
year, optional `note` like "with SIZZY" or an OST name, optional `url`),
and music-platform links. Platform links reuse the generic
`PerformerLink` rows — `detectSocialPlatform` (`src/lib/socialLinks.ts`)
now also recognizes Spotify / Apple Music / YouTube by URL, each with a
dedicated admin form field and an icon in the performer page's social
row. Discography renders as «Альбомы» (cover row) + «Песни и синглы»
(plain row list, first 12 with a «Показать все (N)» fold — see above). Data source so far: the tpop.fandom.com
discography importer — see
[tpop-band-import.md](tpop-band-import.md#discography-import-albums--songs);
no admin CRUD for albums/songs yet.

### Личные бренды

У `PerformerLink` есть `kind` (`PerformerLinkKind`): `OTHER` — как было
всегда, `BRAND` — своё дело артиста (марка одежды, кафе, косметика).
Бренды редактируются отдельным списком в форме исполнителя («Личные
бренды», рядом с «Другими ссылками») и показываются на странице артиста
своим блоком под описанием — чипами с названием.

Почему отдельный вид, а не просто ещё одна ссылка: остальные ссылки
разбираются по адресу (`detectSocialPlatform`) и превращаются в иконки,
и бренд с инстаграм-адресом стал бы безымянной иконкой — то есть потерял
бы ровно то, ради чего заведён. Поэтому бренды вынимаются из общей кучи
ДО распознавания соцсетей, и в иконки/«другие ссылки» уже не попадают.

Название у бренда обязательно: строка без него не сохраняется (кнопка
«https://…» ничего не сказала бы читателю). У прочих ссылок поведение
прежнее — пустая подпись заменяется адресом. Дедупликация по адресу
теперь учитывает вид: бренд и соцсеть по одному адресу — две разные
записи, иначе бренд молча пропадал бы у артиста, чей инстаграм уже
указан в соцсетях.

## Novels

`Novel` — первоисточник экранизаций: название (слаг как у каталога),
автор, обложка, описание и свободные ссылки «где почитать/скачать»
(`NovelLink`). `Drama.novelId` — необязательная связь; на странице
сериала выводится строка «📖 По новелле», на странице новеллы — секция
«Экранизации». Публичный раздел `/novels` (+ пункт в главном меню),
админ-CRUD в `/admin/novels`; в форме сериала новелла выбирается
async-комбобоксом с inline-созданием. **Импорт с Фикбука**: кнопка
«Спарсить с Фикбука» (admin/novels) тянет название, описание, автора
(переводчика), автора оригинала, ссылку на оригинал, бейджи+метки,
размер; обложка — og:image со страницы оригинала. Фикбук закрыт
JS-проверкой — `src/lib/ficbook.ts` пробует fetch, затем chromium
(на сервере headless может не пройти проверку — тогда импортировать с
локальной машины).

**Источник записи.** `Novel.ficbookUrl` (@unique, по образцу
`Drama.doramalandUrl`) — адрес страницы на ficbook.net, откуда взяты
описание, автор, теги и размер. Импорт с Фикбука пишет его сам (и
по-прежнему добавляет ту же ссылку в «Где почитать» — это ещё и
площадка для чтения); вручную — поле «Страница на Фикбуке» в секции
«Источник» формы новеллы. Одна страница Фикбука — одна наша новелла:
повтор адреса и в форме, и в импорте отбивается человеческой ошибкой
(«уже стоит у новеллы …»), а не сырым P2002. Поле попадает в историю
правок вместе с остальными полями формы. На публичной странице новеллы
это единственная строка блока «Источники» (`SourcesBlock`, самый нижний
блок страницы — после отзывов и комментариев; подпись — hostname,
«ficbook.net»); у новеллы без адреса блок не рисуется. Это выполнение
обещания из /terms — источники указаны на страницах записей — для
новелл. Обложка приходит со страницы оригинала, а её адрес и так
показан кнопкой «Оригинал» в «Где почитать», отдельно в источниках он
не повторяется.

## Поля с датой

Везде `DatePickerInput` (`src/components/DatePickerInput.tsx`), нативный
`<input type="date">` не используется: он в каждом браузере свой, а под
тайской локалью отдаёт буддийские года.

Диапазон годов в выпадашке задаётся полем — `yearsBack` / `yearsForward`.
По умолчанию это ближайшие годы (−3…+5), чего хватает событиям и
поездкам, но дату рождения в них было не ввести: нужный год просто
отсутствовал в списке. Поля с датой рождения (профиль, настройки,
карточка исполнителя) передают `yearsBack={100} yearsForward={0}`, и при
длинном списке свежие годы идут сверху.

Месяц и год выбираются собственным выпадающим списком (`PickerSelect`
в том же файле), а не `<select>`: высоту нативной выпадашки рисует
браузер, и сотня годов растягивалась на весь экран — до нужного года
приходилось скроллить страницу целиком. Свой список ограничен по
высоте, прокручивается внутри себя и открывается сразу на выбранном
значении.

## Фото исполнителя

Если `photoUrl` пуст, показывается обложка последнего релиза
(`performerPhoto` в `src/lib/performerPhoto.ts`). У групп своего фото
часто нет вовсе, и на месте карточки оставалась пустая буква, хотя
обложка свежего альбома узнаваема не хуже и уже скачана к нам импортом
с YouTube Music.

Подстановка делается **при отображении**, а не записью в `photoUrl`:
иначе обложка «замёрзнет» в базе, в админке стало бы не видно, есть ли у
артиста настоящее фото, и с выходом нового релиза картинка не
обновилась бы. Работает на `/artists`, странице артиста и в поиске; на
странице артиста альбомы и так загружены, в списках подтягивается один
релиз через `FALLBACK_COVER_SELECT`.

## Mascots

Маскот (актёра или пейринга — например, Polca у Tay × New) — это
`Performer` с `type: MASCOT`: та же карточка со слагом, фото, био, «др»,
соцссылками и дискографией, свой таб «Маскоты» в публичном и админском
каталогах. «Хозяева» — через `MascotOwner` (mascotId → performerId
и/или pairingId, many-to-many в обе стороны): на странице маскота —
секция «Чей маскот», на странице актёра — «Маскоты» (привязанные
напрямую + маскоты его пейрингов). Владельцы задаются в админ-форме
исполнителя при типе «Маскот». Дорамы/пейринги к маскоту не
привязываются (вкладки скрыты), события — можно.

## Правила общего списка исполнителей (АА4, АА14)

Два правила применяются к ЛЮБОМУ витринному списку исполнителей, поверх
той сортировки, которую список уже выбрал. Живут одним модулем
`src/lib/castLineup.ts`, а не копией в каждой странице: списки на
сериале, событии и в каталоге артистов — одни и те же, и первое же
уточнение развело бы копии.

**АА14 — группа вместо своих участников.** `hideMembersOfListedBands`:
если в списке стоит группа (`Performer` type BAND) и рядом её участники
(через `BandMember`), участники из списка убираются. Смысл: группа их уже
представляет, а состав концерта одного бойзбенда читался как шесть
карточек, где пятеро — та же группа поимённо. **Данные не трогаются** —
это только отображение: на странице участника событие/сериал остаётся.
Обратное поведение (страница события дорисовывала участников группы)
убрано по просьбе владельца, см. [events.md](events.md).

**АА4 — пары стоят рядом.** `keepPairingsTogether`: если в списке есть
оба участника `Pairing`, они идут подряд. Это правило про ПОРЯДОК, не про
новую сущность — сортировка списка (по популярности, по алфавиту)
остаётся, просто пара не разъезжается по ней. Группа целиком встаёт на
место своего первого по исходной сортировке участника: так пара не тянет
малоизвестного человека наверх и не роняет известного вниз (в касте
Zomvivor NuNew стоял вторым, Zee — четырнадцатым; после правки Zee
третий, остальные съезжают на одного). Считается связными компонентами,
а не «нашли пару — переставили»: у человека бывает несколько пейрингов
сразу, и цепочка A×B + B×C должна собраться в одну тройку, иначе
результат зависел бы от порядка обхода. Статус пары (CURRENT/PAST) не
учитывается намеренно — бывшая пара в касте старого сериала это ровно тот
случай, ради которого соседство и заводилось.

Пейринги для правила берёт `fetchPairingsAmong(ids)` — один запрос на
страницу по `@@unique([performerAId, performerBId])` + `@@index`
на B, симметричный (`A in ids AND B in ids`), поэтому порядок имён в
паре роли не играет.

**Где применяются:**

| Список | АА14 | АА4 |
| --- | --- | --- |
| Каст сериала `/dramas/[id]` | да | да |
| «Кто выступает» на `/event/[id]` | да | да |
| «Лайнап по дням» на `/event/[id]` | да | да |
| Избранное (закреплённая секция) на `/artists` | — | да |
| Алфавитный список `/artists` | — | нет, намеренно |

Алфавитный список не трогаем: там порядок задаёт буква, и переставленная
пара выпала бы из своей секции, разойдясь и с рейкой букв, и с
серверными страницами `?letter=X`. Закреплённая секция избранного —
плоская, без букв, и в ней соседство работает.

## Pairings

A `Pairing` names a two-performer "ship" (`performerAId`/`performerBId`,
unique together, optional display `name`).
Selectable on events alongside/instead of individual performers.

**Имя пейринга — ЗАГОЛОВОК своего блока, а не подпись в карточке**
(АА3, правка владельца 2026-09-06). На странице артиста пары
раскладываются по блокам так:

- безымянные текущие — блок «В паре с»;
- безымянные бывшие — блок «Бывшие пары» (приглушённый);
- каждая НАЗВАННАЯ пара — свой блок, и заголовок ему само имя
  («GhostSheep»). У названной пары имя и есть то, как её зовут фанаты,
  а «В паре с» про неё ничего не сказало бы. Две пары с одинаковым
  именем встают в один блок. Бывшая названная приглушена так же, как
  «Бывшие пары»: статус читается видом, раз в заголовке теперь имя.

В карточке при этом всегда стоит ЧЕЛОВЕК: раньше имя пары заменяло
партнёра, и по карточке было не понять, с кем пара. В чипах события и
«чей маскот» — «A × B · имя» по той же причине.

**В админке — то же правило**: и в списке `/admin/pairings`, и во
вкладке «Пейринг» формы исполнителя строка показывает участников
КАРТОЧКАМИ (фото + имя + ссылка на правку), а имя пары стоит плашкой
рядом со статусом «Текущий»/«Бывший» — это ярлык пары, а не её
заголовок. В списке пейрингов карточки обе («A × B»), в форме
исполнителя — одна, партнёра: второй в паре и так тот, чью страницу
открыли. Комбобоксы (выбор пейринга на событии, привязка маскота)
по-прежнему показывают имя первым — там по нему ищут строкой.
Admin: `src/app/admin/(protected)/pairings/` +
`PairingManager.tsx`/`CreatePairingModal.tsx` inside the performer form
for inline creation.

**Deliberately admin-only as a browsable entity**: there is no public
pairings tab/listing anymore (the `/performers?view=pairings` tab was
removed). Publicly, pairings surface as blocks in exactly two places —
the "В паре с"/"Бывшие пары" blocks on a performer's page, and the
lineup chips on an event that has a pairing attached. Плюс невидимо —
порядком: пара стоит рядом в общих списках исполнителей, см. «Правила
общего списка исполнителей» выше (АА4).

**Порядок имён важен** (TAY × New, а не New × TAY): везде пара
выводится как «A × B», поэтому в `/admin/pairings` и в PairingManager
есть кнопка ⇄ — `swapPairingOrder` меняет performerA и performerB
местами.

**Current vs past**: `Pairing.status` (`CURRENT` | `PAST`, default
`CURRENT`) tracks whether a ship is still active — many real-life pairs
break up and one or both performers go on to new pairings, and a
performer can have several `Pairing` rows at once (the schema never
assumed exactly one). Admins toggle status from `/admin/pairings` or a
performer's edit page (`PairingManager.tsx`, `setPairingStatus` action in
`pairings/actions.ts`); `CreatePairingModal` also lets a new pairing be
entered directly as `PAST` (for backfilling history). Every query that
lists a performer's pairings orders `status` before `createdAt`, so
current ones sort first; the public performer page
(`(public)/performers/[id]/page.tsx`) splits them into separate "В паре
с" (current) and "Бывшие пары" (past, shown at reduced opacity)
sections. `mergePairingsForPerformer` (`src/lib/duplicates.ts`) upgrades
the surviving row to `CURRENT` if either side of a merge collision was.

## Dramas

`src/app/(public)/dramas/`, admin `src/app/admin/(protected)/dramas/`
(`DramaForm.tsx`, `actions.ts`). Cast (`PerformerDrama`, with an optional
`role` = character name), agency, filming locations
(`DramaLocation`), and an optional tie-in `Event` (premiere screening —
see [events.md](events.md)) all hang off a `Drama`.

### Страница сериала: порядок секций и каст-сетка (Э2ф)

Страница `/dramas/[id]` — классическая компоновка (по фидбеку
владельца, hero и якорные чипы убраны): шапка с h1 — год в скобках
(`fs-5 text-secondary`) и цветной статус-бейдж
(`DRAMA_STATUS_BADGE_CLASS`) прямо в строке названия, под ним
нативное название/AKA и чип «★ оценка» (чипов года/статуса/серий
нет — число эпизодов есть в фактах); справа `DramaStatusButton` →
постер 15rem слева (под ним кнопка MyDramaList) + факты и синопсис
справа просто текстом, без фона-карточки (график выхода серий свёрнут
внутри фактов, под строкой «Эфир») → события сериала →
актёрский состав → связанные сериалы → локации → источники →
отзывы/комментарии. Строки «Где посмотреть» больше нет.
Длинный синопсис (>300 символов) свёрнут до ~4 строк компонентом
`SynopsisFold` (`src/components/SynopsisFold.tsx`; CSS —
`.synopsis-fold` в `globals.css`): текст живёт в `summary`
`details`-элемента, line-clamp снимается на `[open]`, подпись «Читать
дальше/Свернуть» рисует сам компонент (из словаря языка, а не через
`content` в CSS). Клиентская обёртка после монтирования
меряет реальное переполнение и рендерит обычный абзац без «Читать
дальше», когда текст влез в кламп целиком (порог в символах этого не
знает — ширина колонки плавает). Той же свёрткой свёрнуто био
артиста.

**Каст-сетка**: состав выводится адаптивной фото-сеткой `.cast-grid`
(`repeat(auto-fill, minmax(7.25rem, 1fr))`, на <576px —
`minmax(4.6rem, 1fr)`: ~8 колонок на десктопе, 3–4 на мобильном) из
вертикальных карточек `EntityMiniCard variant="grid"` — крупное
круглое фото, под ним имя и роль (роль серым, обе строки
text-truncate); прежний горизонтальный вид остался `variant="row"`
(по умолчанию, другие вызывающие не тронуты). Первые ~14 карточек
видны сразу, остальные — за «Показать всех (N)»: текстовой ссылкой
акцентного цвета (`.btn-link-accent` — кнопка-как-ссылка: раскрытие
списка — навигация по странице, не действие, и кнопка тут тяжеловесна;
элемент остаётся `<button>`). Рисует лёгкий клиентский
`src/components/CastGrid.tsx`; при ≤2 скрываемых раскрывается
сразу. Порядок — по популярности актёра: числу его
событий (`Performer._count.events`, `EventPerformer.performerId`
проиндексирован), при равенстве по имени; поверх этого работают два
общих правила списка исполнителей — участники группы прячутся под самой
группой, пары стоят рядом (см. «Правила общего списка исполнителей»
ниже). Тот же подход — «Кто
выступает» на странице события (см. [events.md](events.md)). CSS —
секция «Э2ф: каст-сетка» в конце `globals.css`.

### График выхода серий

Строки `DramaEpisode` (номер, `airDate`, необязательное название;
`@@unique([dramaId, number])`) — какая серия на какое число. Даты
разбираются со страницы `/episodes` на MyDramaList, см.
[mydramalist-import.md](mydramalist-import.md); отдельными строками, а не
вычислением «`airedFrom` + неделя × номер», потому что у сериалов
бывают перерывы, сдвоенные показы и спецвыпуски.

**График свёрнут под строку «Эфир»** (просьба владельца). В конце
строки «Эфир: 12 авг. 2026 — 14 окт. 2026 (по средам)» стоит
переключатель «Подробнее», по нему прямо под строкой раскрывается
поимённый список серий; по умолчанию свёрнут. **Серий в базе нет —
переключателя нет вовсе**, остаётся обычная строка «Эфир»; отдельной
секции «График выхода серий» на странице больше нет. Внутри свёртки —
подзаголовок «График выхода серий» и «вышло 6 из 16» справа, список
ограничен по ширине 30rem: иначе номер серии и дата разъезжаются по
краям колонки.

Свёртка нативная, на `details`/`summary` (CSS — `.schedule-fold*` в
конце `globals.css`), и в отличие от `SynopsisFold` без клиентской
обёртки: график — не текст, переполнение мерить не надо, так что
JS тут не нужен вовсе. Оттуда же берётся и доступность: браузер
отдаёт `summary` ролью disclosure с `expanded: false/true` и делает
его фокусируемым, без единой ARIA-атрибуты в разметке. Строка «Эфир»
собирается отдельным фрагментом (`airedLine`), потому что она же
служит `summary`, а абзац внутри `summary` недопустим — там
разрешено только фразовое содержимое. Даты в ней форматирует
`formatDateWithYear` из `src/lib/dates.ts` (раньше страница звала
`toLocaleDateString` сама, мимо общих форматтеров). Пара подписей
«Подробнее»/«Свернуть» лежит в разметке (строки из словаря языка), а
CSS показывает нужную половину по `[open]` — тем же приёмом, что и
`.synopsis-toggle-label`.

Список рисует `src/components/EpisodeSchedule.tsx` (CSS —
`.episode-schedule*` в конце `globals.css`); даты в него приходят уже
готовыми строками — форматирование остаётся на сервере, чтобы дату
негде было случайно прочитать в часовом поясе браузера. Рисуется он
вертикальным рельсом: линия с
точкой на каждой строке, у вышедшей серии точка залита, у будущей
пустая. «Прошлое сверху, будущее снизу» так читается формой, без
легенды; то же различие повторено цветом (вышедшая — белым, будущая —
серым). Сегодняшняя серия — акцентом и с ореолом у точки, а вместо даты
у неё чип «сегодня»: ради неё в этот список и заходят. У серии без даты
в колонке даты стоит «дата не объявлена» — у выходящего сериала хвост
расписания обычно пустой, и это не то же самое, что «серии нет».

Вышедшей считается серия с `airDate <= сегодня`, и «сегодня» сравнивается
**ключами дат** (`dateKey` из `src/lib/dates.ts`, YYYY-MM-DD), а не
моментами: даты лежат тайским настенным временем, и сравнение с
`new Date()` врало бы ровно на границе суток. Год в строке появляется,
только когда расписание не про текущий год (или переходит через Новый
год): у выходящего сериала он повторялся бы в каждой строке впустую, а у
прошлогоднего без него «3 янв» не отличить от начала сезона. Дату с годом
собирает `formatCombinedDateList` (с одной датой на входе), а **не**
`formatDateWithYear`: последний по-русски оставляет висящее «г» без точки
(его `.replace(/\.$/, "")` съедает точку сокращения «г.»), и в столбце дат
это видно на каждой строке.

**Свёртка длинных расписаний.** Видно 10 строк, остальное — за той же
текстовой ссылкой «Показать все (N)» (`.btn-link-accent`, при ≤2
скрываемых раскрывается сразу, как в `CastGrid`). Окно берётся не
с первой серии, а **от «сегодня»**: у
выходящего сериала это две вышедшие серии над границей и ближайшие
впереди — за этим на страницу и приходят, а начало сезона отвечает не на
их вопрос. У завершённого и у ещё не начавшегося сериала «сегодня» в
списке нет, и там обычный список с первой серии. Когда спрятано начало,
ссылка стоит **над** списком: список, открывающийся с четвёртой серии,
иначе выглядит обрезанным, а объяснение лежало бы под ним.

### Оценки сериала: своя, наша и сводная (АА2)

Оценок у сериала три, и путать их нельзя:

| что | где лежит | кто ставит |
| --- | --- | --- |
| **своя** | `DramaWatchStatus.rating` | человек, себе |
| **наша** | считается | все на сайте |
| **MyDramaList** | `Drama.mdlScore` | приезжает импортом |

**Шкала везде одна: 0.5–10 с шагом 0.5** (правка владельца
2026-09-07). Половинки — потому что они есть у MyDramaList: до этого
импорт округлял их «8.5» до девятки, и своя оценка не совпадала с тем,
что человек там поставил. Поля `Float`, а не `Int`.

**Своя** живёт на строке просмотра, а не отдельной моделью: оценка и
статус — про один и тот же факт «я это смотрел», и лишняя таблица к ним
ничего не добавляет. Отметки просмотра у сериала может ещё не быть —
экшен `setDramaRating` заводит её со статусом «Смотрю сейчас»: это
мягче, чем объявить сериал просмотренным за человека.

Ввод — общий `StarRatingInput`: десять контурных звёзд, поверх которых
лежит закрашенный слой, обрезанный по ширине (50% или 100%). Половинка
ставится левой половиной звезды, целое — правой (две прозрачные
кнопки поверх иконки); повторный клик по той же половинке снимает
оценку. Два места:

- `DramaRating` — звёзды с подписью «Моя оценка», на странице сериала;
- `DramaRatingSelect` — компактный вид для строк таблиц: «★ 8.5», по
  клику окошко с теми же звёздами покрупнее. Не список из двадцати
  чисел — с половинками он стал бы простынёй. Колонка «Оценка» есть в
  каталоге `/dramas` и во вкладке «Сериалы» профиля (в своём профиле
  рабочая, в чужом просто текст).

**Наша и сводная** — `src/lib/dramaRating.ts`. Наша складывается из
своих оценок И публичных отзывов, но **один человек считается один
раз**: звёздочка и отзыв — это одно мнение, высказанное дважды.
Приоритет у звёздочки (её ставят позже и меняют чаще). Приватные отзывы
в среднее не входят — невидимая оценка, двигающая публичное среднее,
вызывала бы вопросы.

Показываем ОДНО число — среднее нашей оценки и MyDramaList
(`combineScores`), без подписи, чей это рейтинг (правка владельца
2026-09-07: «уберём подпись, что рейтинг именно MDL»). Из чего оно
сложено, объясняет подсказка по наведению (`.tooltip-wide` +
`data-tooltip`): при двух источниках — «Среднее оценок нашего сайта и
MyDramaList: у нас 8.9 (3 оценки), MyDramaList 7.8»; при одном честно
называется он один. Среднее именно двух чисел, не взвешенное по числу
голосов — так просил владелец; обратная сторона в том, что пока оценок
у нас единицы, одна чужая девятка заметно двигает итог (вес добавляется
одной формулой в `combineScores`, если понадобится).

Одно и то же число стоит чипом у заголовка сериала, строкой в самом
начале колонки фактов (над «Студия», под своими звёздами — правка
владельца 2026-09-07) и бейджем у названия в строках каталога.

Оценки приезжают и импортом списка с MyDramaList — только в пустое, см.
«Оценки» в [mydramalist-import.md](mydramalist-import.md). В выгрузке
CSV — колонка «Моя оценка». Правила сведения проверяет
`tests/unit/dramaRating.test.ts`.

### Счётчик серий на карточках «Смотрю сейчас»

Число лежит **чипом на самом постере**, в правом верхнем углу (выбор
владельца 2026-09-06 из трёх вариантов; до этого счётчик висел строкой
под карточкой и растягивался во всю её ширину). В покое это тихое
«3/13», по наведению на карточку чип плавно разворачивается в
«− 3/13 +»: ширина, прозрачность и лёгкий масштаб за 0.18s (правка
владельца — «слишком резко»). В покое кнопки схлопнуты по ширине, а не
спрятаны через `display: none`: так чип остаётся узким, но кнопки живут
в разметке — до них можно добраться табом (по фокусу разворачиваются) и
их видит скринридер. Чип прибит к правому краю постера и растёт влево,
поэтому «+» с места не двигается и не убегает из-под курсора. Без
ховера (палец) кнопки показываются всегда, при системной просьбе
«поменьше движения» — разворот мгновенный.

Карточек в блоке шесть — ровно два ряда по три (`col-4`), сетка без
дырок.

В разметке счётчик лежит РЯДОМ с плиткой, а не внутри неё: плитка
целиком — ссылка, а кнопку в ссылку класть нельзя. Систему координат
задаёт ячейка ряда `.poster-tile-cell`, чип позиционируется в ней
абсолютно (`.episode-progress.is-card`). Поле ввода в этом виде не
показывается — число меняют кнопками, как в таблице каталога.

### «Выходит сегодня» на главной

Те же строки `DramaEpisode`, только запросом «`airDate` в пределах
сегодняшних суток» (`startOfDay`/`endOfDay`, `@@index([airDate])`) —
`src/app/(public)/page.tsx`. Отдельного фильтра «онгоинги» нет и не
нужно: расписание ведётся только у тех сериалов, что ещё выходят, а у
завершённого сегодняшних дат не бывает.

Блок стоит во втором ряду главной — **слева, пополам со «Смотрю
сейчас»** (правка владельца 2026-09-06: обе колонки `col-lg-6` и одной
высоты через `align-items-stretch` + `h-100` у секций). «Что нового»
уехало ПОД ряд, во всю ширину и в три колонки: раньше лента жила в той
же колонке, что и афиша, и растягивала её далеко ниже соседа. Никто
сегодня не выходит — блока нет вовсе, и ряд занимает одно «Смотрю
сейчас».

Вид — **список строками, ровно как в каталоге `/dramas`**: миниатюра
постера (`.drama-row-poster`, буква вместо картинки, когда постера
нет), название и подстрока на панели `surface surface-hover`. Строка
здесь компактнее каталожной — `.airing-row` ужимает отступы и
миниатюру до 2×2.7rem (правка владельца 2026-09-06: блок занимал
слишком много места; было ~100px на строку и 680px на блок, стало ~76
и ~508).
Третьего стиля списка сериалов на сайте так не заводится. Номер серии —
чипом справа («5 серия»); сдвоенный показ (две строки расписания на
один сериал в один день) схлопывается в одну строку с диапазоном
(«7–8 серии»).

**Кому показывать.** По умолчанию всем: это витрина, а не личный
список, — на вопрос «что сегодня выходит» отвечают и про то, что
человек ещё не смотрит («Смотрю сейчас» рядом как раз про личное). Но
отмеченное человеком (`DramaWatchStatus`, любой статус) идёт **вперёд**
и подписывается статусом вместо года — своё в общем ряду должно быть
видно сразу. Показывается до 8 строк.

Рядом с ссылкой на календарь — **переключатель «Все / Мои»** (правка
владельца 2026-09-06): `?airing=mine` оставляет только отмеченные
сериалы. Состояние в адресе, а не в куке — ссылкой можно поделиться, и
без JS переключатель работает. Переключателя нет вовсе, когда среди
сегодняшних нет ни одного отмеченного: «Мои» вело бы в заведомо пустой
список.

Most of the catalog was bulk-imported from blscene.com rather than typed
in by hand — see [blscene-import.md](blscene-import.md). `Drama.status`
(TMDB's own airing-status vocabulary — Ended/Returning Series/etc., shown
as a badge next to the title) comes from the TMDB importer, see
[tmdb-import.md](tmdb-import.md); a drama can also be enriched
point-by-point from its MyDramaList page, see
[mydramalist-import.md](mydramalist-import.md). Status badges are
color-coded (`DRAMA_STATUS_BADGE_CLASS` in `src/lib/dramaStatus.ts` +
`.status-badge-*` in `globals.css`): not-yet-aired red, currently airing
green, finished blue, canceled gray. `Drama.network` (broadcaster/streamer)
comes from the Wikipedia agency importer, see
[wikipedia-agency-import.md](wikipedia-agency-import.md).

## Agencies

`Agency` has its own roster and can also be the production/distribution
agency on a `Drama` directly (independent of the cast's agencies). The
public agency page header is a `DetailHero` without `photoUrl` (square
logos crop badly in the 3/4 photo card) — warm-gradient hero with
«артистов: N» / «сериалов: N» chips and the favorite heart; the round logo
sits in the content next to the description. The
page shows its roster as a compact wrapped card grid
(square photo, nickname, real name in parentheses, favorite heart
overlaid) rather than full-width rows — rosters run to dozens of
performers. An
agency's roster/productions can be bulk-imported from any of several
sources, depending on what that particular agency has published where:
its own Wikipedia article (see
[wikipedia-agency-import.md](wikipedia-agency-import.md)), a TMDB
production-company page (see
[tmdb-company-import.md](tmdb-company-import.md)), a drama.fandom.com
category page (see
[drama-fandom-agency-import.md](drama-fandom-agency-import.md)), or its
own official site (see [memindy-import.md](memindy-import.md),
[change2561-import.md](change2561-import.md) — the latter combines its
own site for artists with its Wikipedia article for productions, since
not every agency publishes both halves in an equally parseable place).
All of these funnel through the same TMDB-matching/dedup rules
(`src/lib/agencyTmdbMatching.ts`) regardless of source.

**Admin management is its own section** — `/admin/agencies` (list with
logo, performer count, search, pagination; `/admin/agencies/new` and
`/admin/agencies/[id]/edit` for CRUD) with its own sidebar entry in the
«Каталог» group. The old embedded view `/admin/performers?view=agencies`
redirects there; the «Агентства» tab in `AdminPerformerTabs.tsx` is now
a plain link to `/admin/agencies`. The public site still consolidates
agencies under `/artists?view=agencies`.

**Agency links** (`AgencyLink`, same shape as `LocationLink`): free-form
label+url rows in `AgencyForm.tsx`'s «Ссылки» section (`linkLabel`/
`linkUrl` arrays; saving clears and recreates the agency's rows, same as
the roster). The public agency page splits them like the performer page:
URLs recognized by `detectSocialPlatform` render as `SocialLinkIcons`,
the rest as labeled buttons — both in the `DetailHero` footer. The
agency hero uses the immersive novel-style backdrop (logo blurred as
background) with `photoShape="circle"` — the portrait 3/4 photo card
cropped square logos (GMMTV's «GMM» read as «MM»), the 1/1 circle
matches the logo circle used in lists.

### A performer can belong to more than one agency

`Performer` ↔ `Agency` is many-to-many (`PerformerAgency`), not a single
`agencyId` — a drama is sometimes co-produced by two studios, so its cast
may formally be signed to a different studio than the one that produced
it, and a performer can move agencies over time. Every importer that
discovers an agency association *adds* to the performer's set rather
than overwriting it (`addPerformerAgency` in
`src/lib/performerAgency.ts`, idempotent) — concretely: syncing GMMTV's
roster ensures GMMTV is in the set without dropping a Studio Wabi Sabi
membership picked up elsewhere, and vice versa. `PerformerForm.tsx`'s
"Агентства" field is a multi-select (`EntityMultiSelect`, `agencyIds` in
form data) instead of the old single dropdown; the public performer page
lists all of a performer's agencies, comma-separated, each linking to
its own agency page.

No current/past status yet (a performer who's *left* an agency still
just shows as "associated with" it) — deliberately deferred until it's
actually needed, per the same reasoning as `Pairing.status` existing
for pairings but not (yet) for agencies.

An admin agency's roster editor (`AgencyForm.tsx`'s performer picker) is
a full "this is exactly who's currently in this agency" replace — saving
it clears and recreates *that agency's* `PerformerAgency` rows only, so
it never touches a performer's membership in any other agency.

## Duplicate names

Both `PerformerForm.tsx` and `DramaForm.tsx` show a live "похоже, уже
есть" hint under the name field on **create** (not edit) forms — see
[duplicates.md](duplicates.md).

## Async entity search in admin forms

No admin combobox receives a full heavy catalog as a prop anymore —
~18k performers made selects freeze the page, and every other catalog
was creeping the same way. Both `EntityMultiSelect` **and**
`EntitySelect` support a `searchOptions` prop: nothing loads upfront,
options are fetched server-side as you type (top 20, min 2 chars,
300ms debounce, stale-response sequencing); `options` then only needs
to cover already-selected ids (edit pages pass the entity's own linked
rows, new pages pass `[]`).

Search actions, all `requireAdmin`-guarded: `searchPerformerOptions` /
`searchSoloPerformerOptions` (performers/actions.ts — solo variant for
band members and pairing partners), `searchDramaOptions`
(dramas/actions.ts), `searchEventOptions` (events/actions.ts),
`searchLocationOptions` (locations/actions.ts, каталожные only). Wired
into: EventForm (performers, drama, location), DramaForm (cast,
locations), PerformerForm (band members, dramas, events, pairing
partner), PairingManager, CreatePairingModal, AgencyForm (roster,
dramas), TtmImportFlow (drama, extra performers). Small lists
(agencies, a performer's own pairings) keep the client-side filtering
mode — `searchOptions` simply isn't passed there.

## Отзывы и комментарии (кинопоиск-стайл)

Модели `Review` (оценка + обязательный текст, один отзыв на юзера
на объект — составные `@@unique` с NULL-полями) и `Comment` (плоская
лента, без веток) с nullable-ссылками на Drama/Novel/Event — ровно одна
задана. Общий server-компонент `src/components/ReviewsAndComments.tsx`
(рендерится внизу страниц сериала, новеллы и события) + экшены в
`src/app/(public)/reviews/actions.ts` (`saveReview`/`deleteReview`/
`addComment`/`deleteComment`). Цвет оценки как на Кинопоиске: 7+
зелёная, 5–6 серая, ниже — красная; средняя оценка в заголовке блока.
Форма отзыва — `<details>`-свёртка (без JS), комментарий удаляет автор
или админ. Анониму (открытый каталог) всё видно, вместо форм — CTA
«войдите».

**Оценка отзыва — по разделам** (правка владельца 2026-09-07): общая
(`rating`, обязательная, она и идёт в средний рейтинг) плюс
необязательные `ratingStory` / `ratingActing` / `ratingMusic`. Набор
разделов зависит от типа записи (`RATING_FIELDS` в
`ReviewsAndComments.tsx`): у сериала сюжет + актёры + музыка, у новеллы
только сюжет, у события только музыка — актёрской игры у концерта нет.
Поле `rating` осталось на месте намеренно: `Review` общая для сериалов,
новелл и событий, и убрать оценку из отзывов целиком значило бы лишить
оценок новеллы и события.

Ввод — те же звёзды с половинками, что у своей оценки сериалу
(`ReviewRatingFields` поверх `StarRatingInput`), значения уезжают в
server action скрытыми полями, форма остаётся серверной. Пока общую
оценку не тронули руками, она идёт за средним по заполненным разделам —
поставил 9/8/7, внизу само встало 8; ткнул в общую сам — она
перестаёт бегать (и об этом прямо написано под шкалами, чтобы движение
не выглядело сбоем).

Комментарии поддерживают **ответы** (один уровень: parentId, ответ на
ответ цепляется к корню треда; автору родителя уходит
телеграм-уведомление) и **лайки** (`CommentLike`, клиентский
`CommentLikeButton` с оптимистичным тогглом). Оценки отзывов у сериала входят в
общую оценку сайта — вместе со звёздочками и с дедупликацией по
человеку, см. «Оценки сериала» выше.

## Источники (атрибуция)

Блок «Источники» (общий компонент `src/components/SourcesBlock.tsx`)
показывается на страницах: артиста (references + tpop/MDL/YT Music —
своя разметка, исторически первая), локации (`Location.sourceUrl`),
сериалы (`mydramalistUrl` + `blsceneUrl` + `doramalandUrl` — ссылка
на dorama.land есть только у сериалов с русским переводом, см.
[doramaland-import.md](doramaland-import.md)), события (`Event.sourceUrl`,
проставляется TTM-импортом и краулером фестивалей musicfestival.in.th;
у артиста то же — `Performer.musicFestivalUrl`, см.
[musicfestival-import.md](musicfestival-import.md)) и агентства (`Agency.sourceUrl`,
проставляется всеми импортёрами агентств; у созданных руками блока
нет). Обещание «источники указаны на страницах записей» — в /terms.

## Хлебные крошки (BreadcrumbList)

Детальные страницы каталога — сериал, артист (и маскот), новелла,
локация, агентство — отдают в конце разметки `BreadcrumbList` через
`breadcrumbJsonLd(items, locale)` из `src/lib/seo.tsx` и компонент
`JsonLd`. Крошка всегда из трёх ступеней: главная → раздел → сама
запись. Пути передаются БЕЗ языкового префикса, `breadcrumbJsonLd`
добавляет его сам (`localeHref`), поэтому на `/ru/...` ступени ведут на
русские версии.

Видимой крошки на деталках нет: её роль играет ссылка-возврат вверху
страницы (`src/components/BackLink.tsx`, «← Все сериалы»). Она
контекстная — если пользователь пришёл внутри сайта, клик возвращает на
предыдущую страницу, — но в серверном HTML это всегда `fallbackLabel` и
`fallbackHref`, то есть ровно то, что видит краулер. Поэтому вторая
ступень крошки намеренно совпадает с этой ссылкой и текстом, и адресом:
`t.catalog.breadcrumb.*` («All series» / «Все сериалы») — это подписи
`back` без стрелки. **Меняете `back` — поменяйте и `breadcrumb`**, иначе
разметка разъедется с видимым текстом, а Google просит их совпадения.

Адреса ступеней: раздел — тот же, что у ссылки-возврата (у агентств это
`/artists?view=agencies`, у маскотов `/artists?view=mascots` — обе
живут вкладками каталога артистов), последняя ступень — канонический
адрес самой страницы. Название записи берётся в языке страницы
(`dramaTitleForLocale` у сериалов).

## Языки

Каталог двуязычный (см. [i18n.md](i18n.md)): подписи, кнопки, пустые
состояния, статусы просмотра и названия разделов берутся из словаря
`src/lib/i18n/{en,ru}/catalog.ts`, серверные страницы читают его через
`getT()`, клиентские компоненты (`DramaStatusButton`, `CastGrid`,
`AlphabetDataList`, `DramaLocationGroups`, `SynopsisFold`,
`EpisodeSchedule`) — через `useT()`. Внутренние ссылки идут через `AppLink`, иначе со страницы
`/ru/...` они уводили бы на английскую версию.

Подписи, которые лежат рядом с данными, тоже приходят из словаря, а не
из общих модулей: статусы просмотра (`t.catalog.watchStatus`, порядок —
по-прежнему `WATCH_STATUS_ORDER`), статус производства
(`t.catalog.dramaStatus`), типы релизов (`t.catalog.albumType`),
категории мест (`t.catalog.locationCategory`) и день эфира
(`t.catalog.airedOn`). Русские подписи в `dramaStatus.ts` и
`locationCategories.ts` остаются — ими пользуется одноязычная админка.
В `watchStatus.ts` подписей больше нет: ими пользовалась только
публичная часть, и они уехали в словарь целиком.

Контент из базы не переводится: названия сериалов, синопсисы, имена и
роли приходят с MDL/blscene и уже английские. Даты форматируются по
языку страницы (`ru-RU` / `en-GB`), возраст артиста — функцией словаря
(в русском со склонением: «26 лет»).
