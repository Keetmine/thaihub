# Catalog: performers, pairings, dramas, agencies

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
  Вертикальные списки (события, песни) раскрываются целиком — без
  внутреннего скролла. Сериалы — анонсы первыми (PLANNED /
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
сразу за названием, следом `DramaStatusButton` (карандаш), видимый
только на ховере строки/фокусе (`@media (hover: none)` — всегда).
Справа жёсткие колонки: статус просмотра · тип
(`t.catalog.dramaType`, перевод свободной строки `Drama.type` с MDL) ·
год · страна (`t.catalog.dramaCountry`) · прогресс «2/10»
(`EpisodeProgress variant="inline"`: тихий счётчик без плашки, кнопки
−/+ проявляются на ховере строки, прогресс-бара в списке нет — бар
остался только у `variant="full"` на странице сериала). На <992px
колонки, кроме прогресса, скрыты. Гостевой кэш выборки —
`dramas-guest-list-v2` (ключ сменён вместе с составом полей). Вся геометрия — в
co-located `src/app/(public)/dramas/dramas.module.css`. Скоуп — класс
`.compact` на корне списка: `AlphabetIndexList` получил проп
`className`, добавляющийся к `.performers-layout`, и разделы без него
(артисты, локации, админка) остаются ровно на общих правилах
`globals.css`; селекторы внутри модуля — `.compact :global(...)`, то
есть заведомо специфичнее одиночных классов globals и не зависят от
порядка CSS-чанков. Постерные сетки артистов и локаций
(`AlphabetDataList variant="cards"`) остались как были.

**Буква группы на /dramas — в левом жёлобе, а не заголовком**
(вторая правка владельца 2026-09-04): строки идут одним визуально
сплошным списком (зазор между секциями = зазору между строками,
0.3rem), а буква стоит слева от первой строки своей группы — крупной
тихой литерой-указателем (1.3rem, `--bs-secondary-color`). Разметка
`AlphabetIndexList` не менялась: тот же `section` с `h2` (a11y и якорь
`#letter-X` живы), просто `.compact` превращает секцию в грид
«жёлоб 2.5rem + строки» — жёлоб считан под самую широкую метку «0-9».
Литера **липкая в пределах своей группы** задаром: sticky грид-элемента
ограничен его грид-областью, так что при скролле длинной группы буква
едет следом и останавливается на её последней строке. Ниже 768px жёлоб
съедал бы ~46px из 390 — там секция снова block, и буква остаётся
маленьким (0.95rem) заголовком-строкой над группой. У артистов и
локаций заголовки букв над группами как были (общие правила globals).

**Рейка на /dramas тоже уплотнена тем же модулем** (в `AlphabetRail`
уплотнение не зашито): на десктопе колонка 1.1rem, кегль 0.6rem —
на /ru в рейке два алфавита плюс «0-9», и с общим шагом 20.4px она не
влезала в экран. **Ниже 768px вертикальной рейки у сериалов нет
вовсе**: справа она съедала ~42px из 390 и прижимала строки — вместо
неё горизонтальная липкая полоска букв НАД списком (grid-row поднимает
её над `.performers-list`, в DOM порядок прежний), скроллится пальцем
по горизонтали, тап-таргет ~2rem высотой, подложка как у `.pill-nav`.
Буквы в ней — те же `<a href="/dramas?letter=X">` (SEO-перелинковка
С-5 не тронута). Якорям `#letter-X` на мобиле нужен запас побольше:
`scroll-margin-top: 8.25rem` (в globals 6rem считаны под один навбар,
без липкой полоски).

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
  списки `/artists` (событийные актёры, полные списки групп/маскотов,
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
«нет в списке — ищите по имени.») и `catalog.dramas.*` («здесь только
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
(plain row list) sections. Data source so far: the tpop.fandom.com
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

## Pairings

A `Pairing` names a two-performer "ship" (`performerAId`/`performerBId`,
unique together, optional display `name` — falls back to "A × B" when
unset). Selectable on events alongside/instead of individual performers.
Admin: `src/app/admin/(protected)/pairings/` +
`PairingManager.tsx`/`CreatePairingModal.tsx` inside the performer form
for inline creation.

**Deliberately admin-only as a browsable entity**: there is no public
pairings tab/listing anymore (the `/performers?view=pairings` tab was
removed). Publicly, pairings surface in exactly two places — the "В паре
с"/"Бывшие пары" blocks on a performer's page, and the lineup chips on
an event that has a pairing attached.

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
проиндексирован), при равенстве по имени. Тот же подход — «Кто
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

### «Выходит сегодня» на главной

Те же строки `DramaEpisode`, только запросом «`airDate` в пределах
сегодняшних суток» (`startOfDay`/`endOfDay`, `@@index([airDate])`) —
`src/app/(public)/page.tsx`. Отдельного фильтра «онгоинги» нет и не
нужно: расписание ведётся только у тех сериалов, что ещё выходят, а у
завершённого сегодняшних дат не бывает.

Блок стоит во втором ряду главной, в **правой колонке — над «Что
нового»** (просьба владельца); слева в том же ряду остаётся «Смотрю
сейчас». Отдельного контейнера у него нет: он живёт в той же
`col-12 col-lg-7`, что и новинки, и потому выравнивается с «Смотрю
сейчас» по верху ряда. Никто сегодня не выходит — блока нет вовсе, и
правая колонка начинается прямо с «Что нового».

Вид — **список строками, ровно как в каталоге `/dramas`**: миниатюра
постера 2.75×3.75rem (`.drama-row-poster`, буква вместо картинки, когда
постера нет), название и подстрока на панели `surface surface-hover`.
Третьего стиля списка сериалов на сайте так не заводится. Номер серии —
чипом справа («5 серия»); сдвоенный показ (две строки расписания на
один сериал в один день) схлопывается в одну строку с диапазоном
(«7–8 серии»).

**Кому показывать.** Всем: это витрина, а не личный список, — на вопрос
«что сегодня выходит» отвечают и про то, что человек ещё не смотрит
(«Смотрю сейчас» рядом как раз про личное). Но отмеченное человеком
(`DramaWatchStatus`, любой статус) идёт **вперёд** и подписывается
статусом вместо года — своё в общем ряду должно быть видно сразу.
Показывается до 12 строк.

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

Модели `Review` (оценка 1–10 + обязательный текст, один отзыв на юзера
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

Комментарии поддерживают **ответы** (один уровень: parentId, ответ на
ответ цепляется к корню треда; автору родителя уходит
телеграм-уведомление) и **лайки** (`CommentLike`, клиентский
`CommentLikeButton` с оптимистичным тогглом). Средняя оценка из
отзывов выводится в шапке страницы сериала («Оценка MyBLHub» рядом с
MDL) и в строках каталога /dramas — «★ N.N» серым текстом рядом с
годом, сразу за названием.

## Источники (атрибуция)

Блок «Источники» (общий компонент `src/components/SourcesBlock.tsx`)
показывается на страницах: артиста (references + tpop/MDL/YT Music —
своя разметка, исторически первая), локации (`Location.sourceUrl`),
сериалы (`mydramalistUrl` + `blsceneUrl` + `doramalandUrl` — ссылка
на dorama.land есть только у сериалов с русским переводом, см.
[doramaland-import.md](doramaland-import.md)), события (`Event.sourceUrl`,
проставляется TTM-импортом) и агентства (`Agency.sourceUrl`,
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
