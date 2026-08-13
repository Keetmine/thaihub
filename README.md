# ThaiHub

Личный трекер концертов и фан-событий (в первую очередь — тайских BL-актёров и их пар).
Публичный календарь/лента событий + закрытая админка для внесения событий и исполнителей.

## Функционал

- Календарь по месяцам и лента «Все события» (сгруппирована по дням)
- Просмотр одного дня линейным расписанием
- Страница исполнителя со списком его предстоящих/прошедших событий
- Поиск по названию события, площадке и исполнителю
- Админка (защищена паролем) — CRUD для событий и исполнителей

## Стек

Next.js (App Router, TypeScript) · Prisma + PostgreSQL · Bootstrap 5 (тёмная тема, оранжевый акцент на сайте / фиолетовый в админке) · Docker

## Локальный запуск

Понадобится локально запущенный PostgreSQL.

```bash
npm install
cp .env.example .env
```

В `.env` пропиши:
- `DATABASE_URL` — строка подключения к своей Postgres-базе (например `postgresql://USER@localhost:5432/thaitrack?schema=public`)
- `ADMIN_PASSWORD` — пароль для входа в `/admin`
- `ADMIN_SESSION_SECRET` — любая длинная случайная строка (например `openssl rand -hex 24`)

Дальше:

```bash
createdb thaitrack          # если базы ещё нет
npx prisma migrate dev      # применить миграции
npm run db:seed             # (опционально) наполнить тестовыми событиями
npm run dev                 # http://localhost:3000
```

Админка — `/admin`, логиниться паролем из `ADMIN_PASSWORD`.

## Запуск через Docker

```bash
cp .env.example .env   # заполнить ADMIN_PASSWORD и ADMIN_SESSION_SECRET
docker compose up --build
```

Поднимет Postgres + само приложение (миграции применяются автоматически при старте контейнера), сайт — `http://localhost:3000`. База данных живёт в volume `db_data`, между рестартами не теряется.

## Структура

- `src/app/(public)/*` — публичный сайт (календарь, лента событий, день, исполнители, поиск)
- `src/app/admin/*` — админка; `admin/login` — вход, `admin/(protected)/*` — закрытые страницы за middleware-проверкой сессии (`src/proxy.ts`)
- `prisma/schema.prisma` — модель данных (Event ↔ Performer, многие-ко-многим)
- `src/app/globals.css` — вся тема (CSS-переменные Bootstrap переопределены под тёмный дизайн; `.admin-shell` переключает акцент на фиолетовый)
