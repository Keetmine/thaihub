# MyBLHub

[myblhub.com](https://myblhub.com) — фан-трекер тайских BL-дорам, актёров и
офлайн-событий (концерты, фанмиты). Открытый каталог сериалов, актёров и
локаций съёмок; по подписке — афиша событий, календарь, поездки и
напоминания в Telegram.

## Стек

Next.js (App Router, TypeScript) · Prisma + PostgreSQL. Одно приложение:
публичный сайт — `src/app/(public)`, админка — `src/app/admin`.

## Локальный запуск

Нужен локальный Postgres, доступный по `DATABASE_URL` из `.env`
(шаблон — `.env.example`).

```bash
npm install
cp .env.example .env        # заполнить DATABASE_URL и остальное
npx prisma migrate deploy   # применить миграции
npm run db:seed             # (опционально) тестовые данные
npm run dev                 # dev-сервер: сам выбирает свободный порт (или передайте -p)
```

После правки `prisma/schema.prisma` — `npx prisma generate`.
Playwright-смоук — `npm run test:e2e` (нужен запущенный dev-сервер).

Админка (`/admin`) открыта пользователям с ролью `User.isAdmin`
(ставится в БД или скриптом), отдельного админ-пароля нет.

## Документация

Как проект устроен на самом деле — архитектура, модель данных и по файлу
на каждую фичу — в [`docs/`](docs/README.md). Деплой (docker compose на
сервере + автодеплой из GitHub Actions) — в
[`docs/deploy.md`](docs/deploy.md).
