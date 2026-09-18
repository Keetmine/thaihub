# MyBLHub docs

MyBLHub is a personal fan-tracker for Thai BL (Boys Love) actors/pairings,
their dramas, and real-world events (concerts, fan meets). Single Next.js
app, Postgres via Prisma, one shared admin password + real per-user
accounts for everyone else.

**When you add or change a feature, update the relevant file here in the
same change.** These docs describe *current* behavior, not history — if
something changes, edit the doc in place rather than appending a note.

## Index

- [architecture.md](architecture.md) — stack, route layout, conventions, known gotchas
- [design-system.md](design-system.md) — примитивы UI и правила оформления
- [audit-2026-08.md](audit-2026-08.md) — полный аудит (админка, фронт, тексты, юридика, качество) и черновик плана доработок
- [deploy.md](deploy.md) — деплой на сервер + автодеплой через GitHub Actions
- [features/i18n.md](features/i18n.md) — два языка: английский по умолчанию,
  русский под `/ru`; как брать строки в коде
- [features/slugs.md](features/slugs.md) — публичные слаги всех сущностей
- [data-model.md](data-model.md) — every Prisma model and what it's for
- [testing.md](testing.md) — the Playwright smoke suite, how to run it
- Features:
  - [events.md](features/events.md) — events, multi-day, presale, ICS export + subscribe feed, location linkage
  - [ttm-crawl.md](features/ttm-crawl.md) — краулер афиши ThaiTicketMajor: черновики событий с артистами из каталога, очередь на одобрение
  - [thaistarx-crawl.md](features/thaistarx-crawl.md) — краулер трекера thaistarx.com: фан-события тайских артистов по миру черновиками в ту же очередь, состав из тегов, дочитка с TTM, часовой пояс площадки
  - [ticket-site-crawl.md](features/ticket-site-crawl.md) — краулеры Ticketmelon (карта сайта) и AllTicket (концертный раздел через браузер, WAF): черновики в ту же очередь, артисты ищутся в тексте события
  - [gmmtv-mascots-import.md](features/gmmtv-mascots-import.md) — недельный краулер маскотов с вики GMMTV (официальный MediaWiki API): черновики маскотов с владельцами из каталога, очередь на одобрение
  - [musicfestival-import.md](features/musicfestival-import.md) — суточный краулер фестивалей musicfestival.in.th: события создаются сразу со всем лайнапом, неизвестные артисты — заготовками; разовый импорт прошедших
  - [home.md](features/home.md) — главная залогиненного: блоки сводки («В этот день», «У друзей» и др.) и витрина релизов /music
  - [premium.md](features/premium.md) — подписка: что платно, пробный лимит (одна поездка/список бесплатно), подарочная подписка, реферальная ссылка
  - [catalog.md](features/catalog.md) — performers/bands, pairings, dramas, agencies
  - [locations.md](features/locations.md) — filming/venue locations, map, visited tracking
  - [blscene-import.md](features/blscene-import.md) — the blscene.com drama/location scraper
  - [tmdb-import.md](features/tmdb-import.md) — TMDB actor/drama importer (official API, not scraping)
  - [mydramalist-import.md](features/mydramalist-import.md) — точечный импорт сериала и актёра со страницы MyDramaList
  - [tmdb-company-import.md](features/tmdb-company-import.md) — TMDB production-company importer (official API, not scraping)
  - [drama-fandom-agency-import.md](features/drama-fandom-agency-import.md) — talent-agency importer from drama.fandom.com (official MediaWiki API, not scraping)
  - [memindy-import.md](features/memindy-import.md) — Me Mind Y artist roster importer
  - [change2561-import.md](features/change2561-import.md) — CHANGE 2561 importer (own site + Wikipedia)
  - [wikipedia-agency-import.md](features/wikipedia-agency-import.md) — talent-agency importer (official MediaWiki API, not scraping)
  - [youtube-music-import.md](features/youtube-music-import.md) — дискография с YouTube Music + суточное обновление
  - [tpop-band-import.md](features/tpop-band-import.md) — idol-group importer from tpop.fandom.com (official MediaWiki API, not scraping)
  - [social.md](features/social.md) — favorites, watch status, "going", friends, friends-going indicator
  - [game.md](features/game.md) — мини-игра «Угадай сериал по постеру» (/game), стрик в localStorage
  - [onboarding.md](features/onboarding.md) — /welcome и интерактивный тур по интерфейсу
  - [gamification.md](features/gamification.md) — stats tab + achievements
  - [place-lists.md](features/place-lists.md) — раздел «Мои места»: свои места, списки-подборки, привязка к поездкам
  - [trips.md](features/trips.md) — user trips: a date range showing every event inside it
  - [telegram-notifications.md](features/telegram-notifications.md) — bot reminders for upcoming events
  - [seo.md](features/seo.md) — заголовки, превью ссылок в мессенджерах, robots и sitemap
  - [search.md](features/search.md) — cross-entity search
  - [doramaland-import.md](features/doramaland-import.md) — русские названия и описания сериалов
  - [asiapoisk-import.md](features/asiapoisk-import.md) — второй источник русских названий и стран
  - [duplicates.md](features/duplicates.md) — duplicate-name warnings + the admin merge tool
  - [admin-notifications.md](features/admin-notifications.md) — бейджи очередей + уведомления админам в Telegram
  - [audit-log.md](features/audit-log.md) — история правок каталога + массовые действия в списках
  - [admin-panel.md](features/admin-panel.md) — разделы админки: модерация, обращения, финансы, рассылки, импорты, настройки
  - [auth.md](features/auth.md) — admin password gate + real user accounts
  - [legal.md](features/legal.md) — /terms, /privacy, справка /help (ФАК), cookie-баннер, согласия
  - [pwa.md](features/pwa.md) — installable web-app manifest/icons + offline cache (service worker)

## Running locally

```
npm run dev              # dev server (picks a free port, or pass -p)
npx prisma migrate deploy   # apply migrations
npx prisma generate         # regenerate the client after a schema change
npm run db:seed             # optional seed data
npm run test:e2e            # Playwright smoke suite — needs a running dev server
```

Requires a local Postgres reachable via `DATABASE_URL` in `.env`, and
admin access granted via the `User.isAdmin` role (no admin password).
`TMDB_API_READ_ACCESS_TOKEN` is optional — only needed for the TMDB
importer (see [tmdb-import.md](features/tmdb-import.md)).
