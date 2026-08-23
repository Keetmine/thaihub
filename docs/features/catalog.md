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
  внутреннего скролла.
- `PerformerLink` is a free-form label+URL list per performer (social
  media, personal café, whatever) — no schema change needed to add a new
  kind of link. `src/lib/socialLinks.ts`'s `detectSocialPlatform(url)`
  recognizes Instagram/TikTok/Twitter by host regardless of what label an
  import or admin gave the row — used to (a) show those three (plus
  `mydramalistUrl`) as branded icon buttons under a performer's photo via
  `SocialLinkIcons`, everything else still a plain labeled pill, and (b)
  give `PerformerForm` three dedicated Instagram/TikTok/Twitter fields
  instead of lumping them into the generic add-a-link list — purely a
  form-UI split, `getLinks` in `performers/actions.ts` merges them back
  into the same `PerformerLink` rows on save, no separate schema field.
- The admin performers list (`/admin/performers`) is a flat, paginated
  list (see "Catalog scale" below) with a `NameSearchBox` search and a
  photo per row, edit/delete icon buttons instead of a favorite toggle.

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

Списки скроллятся **целиком окном** — внутреннего скролл-контейнера
(бывшие `.scroll-list-lg`/`.thin-scroll` на обёртке) больше нет, по
фидбеку владельца. Чтобы рейка букв оставалась под рукой, она липнет к
**центру вьюпорта**: `position: sticky; top: 50vh` +
`transform: translateY(-50%)` (у верхней кромки буквы прятались под
закреплённый навбар), со страховочными `max-height: 80vh; overflow-y:
auto` для очень длинного алфавита. Якоря `#letter-X` скроллят окно;
`.performers-letter-section` несёт `scroll-margin-top: 6rem`, чтобы
заголовок буквы не нырял под навбар.

`/dramas` рендерит записи **строками** (surface-плашка: миниатюра
постера 2.75×3.75rem с фолбэк-буквой, название полностью с переносом,
год и «★ рейтинг» серой подстрокой, справа `DramaStatusButton`) — не
постерной сеткой: в каталоге много одиночных сериалов, карточки ели
место, а длинные названия обрезались. Постерные сетки артистов и
локаций (`AlphabetDataList variant="cards"`) остались как были.

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
  can still match thousands of rows in a catalog this size, so results
  are capped with a "уточните запрос" note rather than rendering
  everything that matched. No page-number pagination here — narrowing
  the search is the intended way to get to a specific entry.
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
владельца, hero и якорные чипы убраны): шапка с h1 (под ним нативное
название/AKA и чипы-факты: год, статус, серии, ★ оценка; справа
`DramaStatusButton`) → постер 15rem слева (под ним кнопка
MyDramaList) + факты и синопсис справа просто текстом, без
фона-карточки → события сериала → актёрский состав → связанные
сериалы → локации → источники → отзывы/комментарии. Строки «Где
посмотреть» больше нет.
Длинный синопсис (>300 символов) свёрнут до ~4 строк:
`details.synopsis-fold`, текст живёт в `summary` (контент details вне
summary в закрытом виде не рендерится), line-clamp снимается на
`[open]`, подпись «Читать дальше/Свернуть» рисует CSS — без JS и без
дублирования текста.

**Каст-сетка**: состав выводится адаптивной фото-сеткой `.cast-grid`
(`repeat(auto-fill, minmax(7.25rem, 1fr))`, на <576px —
`minmax(4.6rem, 1fr)`: ~8 колонок на десктопе, 3–4 на мобильном) из
вертикальных карточек `EntityMiniCard variant="grid"` — крупное
круглое фото, под ним имя и роль (роль серым, обе строки
text-truncate); прежний горизонтальный вид остался `variant="row"`
(по умолчанию, другие вызывающие не тронуты). Первые ~14 карточек
видны сразу, остальные — за кнопкой «Показать всех (N)» (лёгкий
клиентский `src/components/CastGrid.tsx`; при ≤2 скрываемых
раскрывается сразу). Порядок — по популярности актёра: числу его
событий (`Performer._count.events`, `EventPerformer.performerId`
проиндексирован), при равенстве по имени. Тот же подход — «Кто
выступает» на странице события (см. [events.md](events.md)). CSS —
секция «Э2ф: каст-сетка» в конце `globals.css`.

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
MDL) и в строках каталога /dramas — «★ N.N» серой подстрокой рядом с
годом.

## Источники (атрибуция)

Блок «Источники» (общий компонент `src/components/SourcesBlock.tsx`)
показывается на страницах: артиста (references + tpop/MDL/YT Music —
своя разметка, исторически первая), локации (`Location.sourceUrl`),
сериалы (`mydramalistUrl` + `blsceneUrl`), события (`Event.sourceUrl`,
проставляется TTM-импортом) и агентства (`Agency.sourceUrl`,
проставляется всеми импортёрами агентств; у созданных руками блока
нет). Обещание «источники указаны на страницах записей» — в /terms.
