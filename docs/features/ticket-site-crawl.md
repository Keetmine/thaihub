# Краулеры Ticketmelon и AllTicket (черновики без размеченного состава)

Суточные задачи `ticketmelon-crawl` и `allticket-crawl` обходят афиши
[ticketmelon.com](https://www.ticketmelon.com) и
[allticket.com](https://www.allticket.com/concert) и кладут события
**черновиками** в общую очередь (`/admin/imports`, вкладка «События») —
ту же, что у обходов ThaiTicketMajor ([ttm-crawl.md](ttm-crawl.md)) и
ThaiStarX ([thaistarx-crawl.md](thaistarx-crawl.md)). Владелец одобряет
или отклоняет; само в афишу ничего не попадает.

Просьба владельца 2026-09-18: «Ticketmelon и AllTicket давай напишем
парсер… и на них тоже отслеживать». Парсеры СТРАНИЦ у обоих сайтов уже
были — «событие по ссылке» ([events.md](events.md), «Импорт события по
ссылке»); здесь добавлен обход списков.

## Files

- **`src/lib/ticketSiteCrawl.ts`** — оба краулера (`runTicketmelonCrawl`,
  `runAllticketCrawl`), общая запись черновика `fileDraft`, чистые
  помощники (`parseTicketmelonSitemap`, `canonicalTicketmelonUrl`,
  `isPastStart`, `allticketCardsToUrls`), список AllTicket через браузер
  (`fetchAllticketConcertCards`), сводка `summarizeTicketSiteCrawl`.
  `apply: false` — сухой прогон с планом.
- **`src/lib/eventTicketSites.ts`** — парсеры страниц (были);
  добавлены `parseTicketmelonEventMeta` (рубрики, статус публикации,
  момент начала, слаги — краулеру, экрану импорта не нужны) и
  `scrapeTicketmelonForCrawl`; `scrapeAllticket` экспортирован.
- **`src/lib/performerMatching.ts`** — `matchCatalogInText`: артисты
  каталога в свободном тексте (см. ниже).
- **`src/lib/scheduledJobs.ts`** — задачи `ticketmelon-crawl` и
  `allticket-crawl` (раз в сутки, `logsItems: true`).
- **`src/app/admin/(protected)/imports/ticketSiteActions.ts`** —
  `startTicketmelonFullCrawl`: разовый обход всей карты сайта фоном.
- **`src/app/admin/(protected)/imports/page.tsx`** — строки обеих задач в
  списке «Обходы по расписанию» вкладки «События» (у Ticketmelon кнопка
  «Обойти всю карту сайта»); **`ttm-poster/route.ts`** — прокси постера принимает хосты
  Ticketmelon (свой домен и S3-бакет) и `atkmedia.allticket.com`.

## Источники списков

**Ticketmelon** — карта сайта `sitemap-event1..5.xml` (на 2026-09-18 —
602 адреса `https://www.ticketmelon.com/<организатор>/<событие>`;
`lastmod` у всех одинаковый и бесполезен, прошедшие вперемешку с
будущими). Страница события отдаёт всё готовым JSON в `__NEXT_DATA__`
(разбор был — `parseTicketmelonHtml`), краулер дополнительно читает
`categories`, `status`/`is_active` и `show_starttime`. Суточный прогон
берёт до **60 новых страниц** с паузой 1,7 с; вся карта разово — кнопкой
(потолок 700, ~30 минут фоном). Адрес с одним сегментом — страница
организатора, не событие (`canonicalTicketmelonUrl` → null).

**AllTicket** — живой API за AWS WAF с JS-челленджем: curl и Node-fetch
получают `202` с `x-amzn-waf-action: challenge`, а headless-браузер
проходит и получает cookie `aws-waf-token`. Поэтому список — через
playwright (уже рантайм-зависимость, как у blscene): открыть `/concert`,
из страницы `POST /api-content/get-events-menu-key {menuKey:"concert"}`
→ `data.item` (концертный раздел, ~40 карточек; купоны `PACKAGE` и
справочные `INFO` отсеиваются). Сами события — открытые master-файлы
`/master/event_info/<код>.json` (разбор был — `parseAllticketInfo`), без
браузера. Разведка 2026-09-18: `get-all-events {groupKey:""}` — все
категории (42), `get-home` — баннеры и подборки.

**С НАШЕГО СЕРВЕРА ЭТОТ СПИСОК ЗАКРЫТ.** Первый же ночной прогон
(19.09.2026, 09:37) упал: API отвечает `403 {"message":"Forbidden"}` — и
curl, и браузеру, с любыми заголовками, с `www` и без. Публичные
страницы и master-файлы с того же адреса отдаются спокойно (200), то
есть режут именно вызовы API и, судя по всему, по репутации адреса
дата-центра: с домашнего адреса те же запросы получают обычный
челлендж и проходят. Поэтому закрытый список — **не падение задачи**:
`fetchAllticketConcertCards` бросает `AllticketListingBlockedError`,
`runAllticketCrawl` ловит его и заканчивает прогон со строкой «список:
закрыт для этого адреса…» в сводке — без красной точки на вкладке и без
письма админам.

**А самой задачи в админке больше нет** (правка владельца 2026-09-19:
«если импорт закрыт, убери его с сайта, чтоб не было лишний раз причин
нажимать»). У `JobDefinition` появилось поле `unavailable` — строка с
причиной; такую задачу планировщик не запускает вовсе, а
`/admin/schedule` и списки «Обходы по расписанию» на `/admin/imports`
её отфильтровывают. Код, настройки и прошлые прогоны в журнале
остаются: откроется список — снимаем `unavailable`, и задача
возвращается на место. **Импорт AllTicket по ссылке работает и сейчас**
— master-файл события с сервера отдаётся спокойно, так что «Событие по
ссылке» их страницы понимает.

События AllTicket от этого не теряются, они доезжают двумя путями:
«событие по ссылке» с их страницы (master-файл, с сервера работает) и
ссылки на AllTicket в постах ThaiStarX и на фестивалях
musicfestival.in.th — оттуда они приходят вместе со своими событиями.

## Состав: артисты в тексте (`matchCatalogInText`)

Состав на обоих сайтах не размечен — он в названии и описании
(«BOY SOMPOB WORLD Y TOUR», «Joining the lineup: … Phum Viphurit»,
«KristSingto Fan Meeting»). Правила от сильного к слабому, каталог
грузится один раз на прогон (`loadTagCatalog`, общий с тегами ThaiStarX):

1. **Реальное имя** из двух и более слов как фраза («Perawat
   Sangpotirat»).
2. **Ник + первое слово реального имени** («Krist Perawat», «Off
   Jumpol») — так разводятся и тёзки: «Gun Atthaphan» найдёт своего.
3. **Склейка ников пейринга** как слово («KristSingto», «OffGun») —
   оба.
4. **Группа** (`type: BAND`) по названию/алиасу целиком, от четырёх
   знаков и не из стоп-слов («LYKN», «PERSES», «BOSS.CKM», «Slur»).
5. **Одиночный ник** — только от пяти знаков, единственный в каталоге и
   не из стоп-слов («Singto», «Nanon», «Phuwin»). «Off», «Gun», «New»,
   «Win», «Earth», «Film», «First», «Bright» поодиночке не ищутся: это
   обычные английские слова, и в тексте развести их нечем.

Границы слов — не буквы и не цифры, так что тайская буква рядом тоже
граница («บัตรKrist»). Совпадений с тёзками не бывает по построению;
никакого фаззи. Тест — `tests/unit/textMatching.test.ts`.

## Прогон задачи

1. Список (карта сайта / концертный раздел) → канонические адреса.
2. Память — как у TTM: `Event.sourceUrl` с хостом сайта (навсегда
   пропуск), черновики по адресу (PENDING/APPROVED/REJECTED — пропуск,
   NO_MATCH старше 7 дней — перепроверка), **прошедшие и снятые с
   публикации** — NO_MATCH с пометкой `ticketSite.skipped` в payload,
   перепроверка их обходит стороной: иначе 600 адресов Ticketmelon
   перечитывались бы по кругу.
3. Страницы с паузой 1,7 с. Прошедшее — начало (Ticketmelon:
   `show_starttime`; AllTicket: последняя дата из текста) раньше, чем
   сутки назад.
4. Дедуп по содержимому (`findCatalogDuplicate`): сильное совпадение —
   черновика нет, `sourceUrl` бэкфилится, адрес запоминается APPROVED;
   слабое — пометка `possibleDuplicateOf`.
5. `matchCatalogInText(название + описание)` → PENDING (с `ImportedItem`
   типа `event-draft`) или NO_MATCH.
6. Появились PENDING — одно `notifyAdmins("import", …)` на прогон.

Payload черновика — `TtmEvent` плюс `ticketSite: {site, categories,
skipped}`. Одобрение — общий путь `createEventFromTtmImport`; времени у
AllTicket часто нет (тогда `hasTime: false`, см. thaistarx-crawl.md,
«Одобрение»).

## Tests

- `tests/unit/ticketSiteCrawl.test.ts` — адреса и карта сайта Ticketmelon
  (`ticketmelon-sitemap.xml`), мета страницы события
  (`ticketmelon-event.html`: `__NEXT_DATA__` без переводов и форм),
  карточки концертного раздела AllTicket (`allticket-concert.json`),
  прошедшее по датам. Без сети и БД.
- `tests/unit/textMatching.test.ts` — правила поиска артистов в тексте.
