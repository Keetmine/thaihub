# Fandom band/artist importer (tpop, thiphop и любые другие вики)

[tpop.fandom.com](https://tpop.fandom.com/) is a Fandom wiki covering
Thai idol groups (e.g. [BUS](https://tpop.fandom.com/wiki/BUS),
[DICE](https://tpop.fandom.com/wiki/DICE)) — a much better source for
this content than TMDB/Wikipedia, neither of which reliably tracks
idol-group lineups, birth names, or labels.

**Вики — любая на fandom.com** (правка владельца 2026-09-06). Импорт
начинался с одной tpop, и хост был зашит константой в трёх модулях, но
у Fandom тысячи вики на поддоменах, а движок и вёрстка у всех
одинаковые: тот же MediaWiki с `action=parse` и та же
portable-infobox. Сверено на `tpop.fandom.com/wiki/BUS` и
`thiphop.fandom.com/wiki/1MILL` — совпадают `pi-item`,
`pi-data-label`, `pi-data-value`, `pi-image`, `wikitable`,
`mw-headline`; разница только в наборе подписей полей, а нужные нам
(Birth name / Birth date / Birth place / Agency / Other name(s)) есть
на обеих. Теперь хост берётся ИЗ ССЫЛКИ (`src/lib/fandomWiki.ts`:
`parseFandomTarget` возвращает `{ host, title }`), проверяется по
`^[a-z0-9-]+\.fandom\.com$` (это ещё и защита от SSRF — по адресу из
формы ходим мы сами) и протягивается через весь прогон: ссылки внутри
статьи относительные, и дочерние страницы (участники группы,
альбомы, концерты) обязаны браться с ТОЙ ЖЕ вики. Голое название
статьи без адреса по-прежнему означает tpop — `DEFAULT_FANDOM_HOST`.

Живая проверка на thiphop: `1MILL` завёлся с настоящим именем
(Anawat Tripong), датой и местом рождения, фото, агентством
(Def Jam Thailand), 8 альбомами и 58 песнями; `sourceUrl` карточки
указывает на thiphop, а не на tpop.

Побочно поймано на том же прогоне: поле «Other name(s)» бывает
СПИСКОМ («dek1millionbaht» + «1MILL»), и склейка давала имя-мусор
«dek1millionbaht, 1MILL». Из нескольких значений берём совпадающее с
названием статьи (каноничное имя вики), иначе первое. Fandom wikis are CC BY-SA
licensed, same as Wikipedia, and run the same MediaWiki software with an
official `action=parse` API — see
[wikipedia-agency-import.md](wikipedia-agency-import.md), whose shared
parsing helpers this reuses rather than re-implementing.

Fetching the plain rendered page (and even `/robots.txt`) directly hits
a Cloudflare bot-check ("Just a moment…") page — but `api.php` itself
answers cleanly with no challenge, so that's the access path used here.
This is the intended, sanctioned route for an API endpoint, not a
workaround for the challenge on the rendered page (which this doesn't
attempt to defeat).

## Files

- **`src/lib/mediawikiParse.ts`** — MediaWiki HTML-parsing helpers
  shared between this importer and the Wikipedia one:
  `fetchMediaWikiParsedHtml(apiBaseUrl, pageTitle, userAgent)`,
  `headingByText`, `contentAfterHeading`, `textWithBreaks`,
  `parseTableGrid`. Extracted here (rather than each importer keeping
  its own copy) once a second MediaWiki-based source needed the exact
  same rowspan/colspan and heading-wrapper handling.
- **`src/lib/tpopFandom.ts`** — pure fetch+parse, no DB access:
  `fetchTpopBandPage(pageTitleOrUrl)` (name, photo, origin, genre,
  debut, label, current members with their own page links) and
  `fetchTpopMemberPage(pageTitleOrUrl)` (stage name, birth name, birth
  date, birth place, current agency, photo).
- **`src/lib/tpopFandomImport.ts`** — DB orchestration:
  `importTpopBand(pageUrlOrTitle, onProgress?)` upserts the band as a
  `Performer` (type `BAND`) and its label as an `Agency`, then for every
  current member fetches their own page and — если совпадение
  подтверждено не только ником — matches or creates a `Performer`
  (type `SOLO`), and links them via `BandMember`. Участники, про
  которых на вики только имя, записей не получают: их имена уходят в
  описание группы (см. «Участники» ниже).
- **`scripts/import-tpop-band.ts`** — CLI entry point, no review screen:
  ```
  npx tsx scripts/import-tpop-band.ts <tpop-fandom-url-or-title>
  ```

## What gets parsed, and why

- **Current lineup only**: pulled from the band infobox's "Current"
  `<ul><li><a>` list (name + link to that member's own page), not the
  article's larger historical members table further down — that table
  also lists pre-debut/departed members (hit for real on DICE, whose
  table has a literal "Pre-debut" divider row before a member who isn't
  in the current lineup), which don't belong in a band's current roster
  any more than a departed member belongs in an agency's "Current"
  roster in `wikipedia-agency-import.md`.
- **Band bio**: synthesized from Origin/Genre/Debut/Label — the schema
  has no dedicated fields for those, so `synthesizeBandBio` turns them
  into two short sentences ("Pop group from Bangkok, Thailand. Debuted
  December 6, 2023 under SONRAY MUSIC.") stored in the existing `bio`
  field, same field a solo performer's bio already uses.
- **Member profile**: each member's *own* page (not the band's roster
  table) is the source for birth name/date/place/photo/agency — richer
  and more reliable per-member than what the band page itself lists.
  - **Stage name** comes from the "Other name(s)" infobox field
    (stripped of its Thai-script parenthetical), not "Nickname" — the
    former matches the name used in the band's own roster and is what
    fans actually call them in a group context; "Nickname" is often a
    separate, more private nickname (e.g. Marckris's "Nickname" is
    "Marc", used nowhere else on the site). One exception: when no
    "Other name(s)" entry matches the page title but "Nickname" does,
    "Nickname" wins — Gorn of PROXIE has "gboy (Mr.) Leo" there and
    would otherwise become "gboy".
  - **Profile fields** (2026-09-26, owner: «прогнала PROXIE — по
    участникам прошлось, но инфу не дозаполнило»): height, weight,
    blood type, occupation, instruments, solo debut and the article's
    «Trivia» list (footnote markers stripped) are parsed too; the
    profile fields fill blanks only, the facts go to the review queue
    (/admin/facts, see [facts-review.md](facts-review.md)) instead of
    the card. Before, a member whose
    name and dates were already known got nothing from a re-import.
    Parser is a pure `parseTpopMemberPage`, covered by
    `tests/unit/tpopMember.test.ts`. The member page is fetched once and
    also run through `parseTpopArtistExtras` (the artist-page parser),
    so music video appearances and awards fill blanks too — before, they
    arrived only via the artist-page import (owner, 2026-09-26).
  - **Nickname replaces a full-name card name** (2026-09-26, owner: у
    BUS все участники были заведены полными именами). Only when the
    card's `name` equals its `realName` — i.e. it has no nickname at
    all — and the wiki's stage name is shorter: «Ashirakorn
    Suvitayasatian» → «Aa». A card that already has a nickname
    («Copper») or a hand-edited name is left alone; the full name stays
    in `realName`. The slug is not regenerated, so old links keep
    working.
  - **Real name**: "Legal name" takes priority over "Birth name" when a
    page has both (hit for real on DICE's Jay, who has a documented
    legal name change) — otherwise falls back to "Birth name".
  - **Current agency**: an "Agency" field commonly lists every agency a
    member has ever been under, e.g. `"SONRAY MUSIC (2023-present),
    Nadao Bangkok (2020-2022?)"` — `parseCurrentAgencyName` picks the
    entry whose date range says "present", falling back to the first
    entry if none does.

### Reused from `mediawikiParse.ts`

- **`textWithBreaks`**: infobox fields with multiple values are
  `<br>`-joined the same way Wikipedia's wikitable cells are (see
  `wikipedia-agency-import.md`'s network-cell fix) — hit again here on
  the "Agency" and "Birth name" fields, which would otherwise run
  together with no separator at all.
- **`parseTableGrid`**: not used directly by this importer (the current
  lineup comes from the infobox list, not a table), but available if a
  future addition needs the historical members table.

## Matching against our DB

- **Band**: matched by `name` (case-insensitive) + `type: "BAND"`. An
  existing row only gets its blank profile fields filled in (`bio`,
  `photoUrl`) — never overwrites a value that's already set, since a
  band added by hand may already have curated data. The label is
  *added* to its agency set (`addPerformerAgency`,
  `src/lib/performerAgency.ts`) rather than replacing whatever's there —
  see "A performer can belong to more than one agency" in
  [catalog.md](catalog.md#agencies).
- **Участники — правило «одного ника мало»** (правка владельца
  2026-09-10). Ник в тайской сцене ничего не доказывает: «Boom» в
  каталоге четверо, «Gun» — пятеро, и прежний `findFirst` по имени
  привязывал участника к ПЕРВОМУ попавшемуся тёзке. Теперь исход у
  участника один из четырёх (`MemberOutcome`):
  - **имя без своей страницы** («красная» ссылка — так устроена вся
    статья The Yers: Boat, Boom, Tor, Wu) → записи НЕ создаём и ни к
    кому не привязываем. Имя без настоящего имени и даты рождения —
    это строка, а не человек. Состав при этом не теряется: имена
    дописываются в описание группы строкой `Members: A, B, C.`
    (`membersSentence`) — строка добавляется к существующему тексту, а
    не переписывает его, и повторный прогон её не дублирует;
  - **своя страница есть, совпадение подтверждено** настоящим именем
    или датой рождения (ник в подтверждение НЕ идёт — он и есть то,
    что путает тёзок) → связь, пустые поля профиля дозаполняются;
  - **своя страница есть, подтверждение не сошлось** → заводим нового
    `Performer` (`SOLO`) по данным страницы: ложная привязка хуже
    дубля, дубль виден в «Дублях» и сливается. Повторный прогон дубля
    не наплодит — у заведённой записи есть настоящее имя и дата, и она
    опознаётся;
  - **подтверждать нечем** (на вики нет ни настоящего имени, ни даты) →
    единственный тёзка считается им (иначе каждый прогон плодил бы
    новую запись), а из нескольких не выбираем: имя уходит в описание
    группы, причина — в журнал прогона.

  Совпадение по `realName` работает и для тех, кто уже в каталоге под
  настоящим именем (например из TMDB-импорта, который для каста
  предпочитает `realName` — см. `tmdb-import.md`). Агентство участника
  (из поля "Agency" его страницы, с откатом на лейбл группы) добавляется
  в его набор так же, как у группы.
- **`BandMember`**: upserted per member (`bandId_performerId` composite
  key) — safe to re-run, matching character-role `upsert` idempotency
  used elsewhere in this project's importers.

### Photos are stored locally

Both the band's and each member's `photoUrl` go through
`downloadRemoteImage(url, "performers")` before being written, so the DB
never holds a `static.wikia.nocookie.net` URL — same rule as every other
importer, see "Local image storage" in
[tmdb-import.md](tmdb-import.md). This depends on `infoboxImage`
(`src/lib/tpopFandom.ts`) already trimming the `/revision/latest/
scale-to-width-down/268` suffix off the wiki's thumbnail URL: that last
path segment is identical for *every* image on the wiki, and
`downloadRemoteImage` names the local file after it, so without the trim
each photo would overwrite the previous one (Bilkin's photo landing on
Bright's — the same trap the discography importer hits, below). The 78
performer rows written before the download step existed are moved over
by `scripts/localize-remote-images.ts`, which re-applies the same trim
to the URLs already in the DB.

### A band and its members can each have more than one agency

Real idol groups often have both a talent management agency and a
separate music label, signed independently — and a member can be signed
to the label without the wiki listing their management, or vice versa.
Concretely: BUS and DICE were already manually set to agency "Tada
Entertainment" (their management) before this importer ever ran;
tpop.fandom.com's "Label(s)"/"Agency" fields say "SONRAY MUSIC" (their
music label) instead. Because agency associations are additive
(`PerformerAgency`, many-to-many — see
[catalog.md](catalog.md#agencies)), both bands now correctly show
**both** "Tada Entertainment" and "SONRAY MUSIC", and every member picked
up "SONRAY MUSIC" alongside whatever agency they already had — nothing
lost, nothing needed to be chosen between.

## Соцсети из инфобокса (2026-09-23)

Просьба владельца: «с tpop.fandom и других таких сайтов нужно также
тянуть ссылки на соцсети». Берутся **только из инфобокса** (поле `sns`;
`infoboxSocialLinks` в `tpopFandom.ts`) — и у группы, и у каждого
участника, и у агентства (`fetchTpopAgencyPage`, см.
[tpop-agency-import.md](tpop-agency-import.md)).

**Почему не из статьи целиком.** В тексте рядом лежат ссылки лейбла и
соседних групп — на странице участника LYKN это `risermusicth` и
аккаунты самой группы — и адреса КОНКРЕТНЫХ постов
(`facebook.com/…/posts/…`, `x.com/…/status/…`). Взять их значило бы
приписать человеку чужие аккаунты. В инфобоксе стоят его собственные.
Ссылка ещё и фильтруется по известным сетям: в инфобоксе попадается,
например, статья Википедии про систему транскрипции в поле
«Romanization».

**Как доливаются** (`socialLinkSync.ts`, общий модуль; правила те же,
что у импорта с MyDramaList, юнит-тест
`tests/unit/socialLinkSync.test.ts`):

- сравнение по ключу, а не по строке (`socialLinkKey`): один профиль
  приходит и как `instagram.com/x`, и как `www.instagram.com/x/`, и
  `twitter.com` с `x.com` — это один аккаунт;
- сеть «один профиль» (Instagram, TikTok, X) второй ссылкой не
  занимают: это почти всегда переименованный аккаунт, и какая из двух
  живая — решает человек. У YouTube и музыкальных площадок несколько
  страниц законны;
- существующие ссылки не трогаются вовсе — импорт только дополняет.

Проверено на живых страницах: у LYKN доливаются пять ссылок, повторный
прогон не добавляет ни одной; у RISER MUSIC — пять.

## New fields this added

None — reuses the same `Performer`/`Agency`/`PerformerAgency`/
`BandMember` fields every other importer writes to. Ссылки ложатся в
существующие `PerformerLink` и `AgencyLink`. No schema change.

## Discography import (albums + songs)

`scripts/import-tpop-discography.ts <tpop-url-or-title>` — отдельный
проход по секции `==Discography==` той же статьи (сырой wikitext через
`action=parse&prop=wikitext`, парсер — `src/lib/tpopDiscography.ts`).
Исполнитель матчится по названию статьи против `Performer.name` /
`musicAlias` (без регистра) и должен уже существовать.

- Подсекции с "album"/"EP" в заголовке → `Album` (тип ALBUM/EP), с
  обложкой со страницы самого альбома (`prop=pageimages`, URL викии
  обрезается до базового — суффикс `/revision/latest` у всех
  одинаковый и ломал локальные имена файлов). Апсерт по
  `(performerId, title)`.
- Подсекции singles/collaborations/OSTs/soundtracks → `Song` с годом и
  note из `{{small|…}}` («with SIZZY», название OST — для OST-строк
  название песни и OST меняются местами). Повторный запуск докидывает
  только новые (дедуп по title+note в коде — на Song нет уникального
  индекса).

Выводится на публичной странице исполнителя: секции «Альбомы» (ряд
обложек) и «Песни и синглы» (список с годами и note) — см.
[catalog.md](catalog.md#music).
