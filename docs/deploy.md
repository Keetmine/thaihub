# Деплой на сервер

Стек на сервере: docker compose — `app` (standalone Next),
`db` (Postgres 16), `caddy` (HTTPS от Let's Encrypt), `backup`
(суточные pg_dump + tar картинок). Автодеплой — GitHub Actions
(`.github/workflows/deploy.yml`): пуш в main → SSH на сервер →
`git reset --hard` + `docker compose up -d --build`.

## Первичная установка

1. **DNS**: у регистратора A-запись `myblhub.com` → IP сервера
   (+ при желании `www` → CNAME на `myblhub.com`).
2. **Сервер** (Ubuntu, под root):
   ```bash
   bash <(curl -fsSL https://raw.githubusercontent.com/Keetmine/thaihub/main/deploy/setup-server.sh)
   # или скопировать deploy/setup-server.sh руками — ставит Docker,
   # 2G swap (next build падает по OOM на 2GB RAM без него), firewall.
   ```
3. **Deploy key** (репозиторий приватный):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
   cat ~/.ssh/id_ed25519.pub
   ```
   GitHub → репозиторий → Settings → Deploy keys → Add (read-only).
4. **Код и env**:
   ```bash
   git clone git@github.com:Keetmine/thaihub.git /opt/myblhub
   cd /opt/myblhub
   nano .env    # см. список ниже
   ```
5. **Перенос данных с локали** (до первого запуска app):
   ```bash
   # локально:
   pg_dump thaitrack > dump.sql
   scp dump.sql root@SERVER:/opt/myblhub/
   rsync -az --info=progress2 public/uploads/ root@SERVER:/tmp/uploads/

   # на сервере:
   cd /opt/myblhub
   docker compose up -d db
   docker compose exec -T db psql -U thaitrack thaitrack < dump.sql
   docker compose run --rm -v /tmp/uploads:/src app sh -c "cp -r /src/. /app/public/uploads/"
   rm -rf /tmp/uploads dump.sql
   ```
   `migrate deploy` при старте app увидит `_prisma_migrations` из дампа
   и ничего не перекатит.
6. **Запуск**: `docker compose up -d --build` (первая сборка ~5-10 мин).
   Проверка: `docker compose ps`, https://myblhub.com.
7. **Telegram-вебхук** (один раз, можно с локальной машины —
   это просто вызов Bot API): `npx tsx scripts/setup-telegram-webhook.ts`
   с прод-`APP_URL` в env. И `/setdomain` у BotFather → myblhub.com,
   иначе Login Widget не отрисуется.

## .env на сервере

```
POSTGRES_PASSWORD=<длинный случайный>
DOMAIN=myblhub.com
APP_URL=https://myblhub.com
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=myblhub_bot
TELEGRAM_WEBHOOK_SECRET=<длинный случайный>
TMDB_API_READ_ACCESS_TOKEN=...
YANDEX_METRIKA_ID=...       # номер счётчика Метрики (без него не грузится)
GTM_ID=GTM-XXXXXXX          # контейнер Google Tag Manager (без него не грузится)
SENTRY_DSN=...              # серверные ошибки; без него SDK молчит
NEXT_PUBLIC_SENTRY_DSN=...  # тот же DSN для клиентских ошибок
GOOGLE_CLIENT_ID=...        # + в консоли Google redirect URI
GOOGLE_CLIENT_SECRET=...    #   https://myblhub.com/api/auth/google/callback
```
`PREMIUM_PRICE_STARS` опционален — цена правится в /admin/settings.

Почта (сброс пароля + дубль админ-уведомлений; без этих переменных
почтовые флоу честно отключены — сайт работает и без них). Сервис ещё
не выбран (см. roadmap, «Почта»); Cloudflare-решения не используем —
аудитория в РФ. Если брать Яндекс 360 (платный, зато один сервис даёт
и ящик, и SMTP): 360.yandex.ru → домен → TXT-подтверждение → MX
`mx.yandex.net` + SPF
`v=spf1 redirect=_spf.yandex.net` + DKIM из панели → создать ящик →
включить «Пароли приложений» и сгенерировать пароль для SMTP (обычный
пароль аккаунта в SMTP не работает):

```
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=admin@myblhub.com
SMTP_PASS=<пароль приложения>
SMTP_FROM=admin@myblhub.com
```

После этого в /admin/settings указать `admin_notify_email` — админ-
уведомления начнут дублироваться письмом.

## Где собирается образ

В GitHub Actions, не на сервере. Сборка Next на боевой машине (4 ГБ RAM)
забирала почти весь процессор и на 8–10 минут делала сайт неотзывчивым —
страницы отвечали по 30 секунд. Теперь workflow собирает образ, пушит в
`ghcr.io/keetmine/thaihub:<sha>`, а сервер только скачивает готовый и
перезапускает контейнер: пара секунд вместо десяти минут.

Локально `docker compose up --build` по-прежнему собирает из исходников —
переменная `APP_IMAGE` не задана, и compose берёт локальный тег.

## Автодеплой (GitHub Actions)

Секреты репозитория (Settings → Secrets and variables → Actions):

- `DEPLOY_HOST` — IP сервера;
- `DEPLOY_USER` — `root` (или деплой-пользователь);
- `DEPLOY_SSH_KEY` — **приватный** ключ, чей публичный добавлен в
  `~/.ssh/authorized_keys` на сервере (заведи отдельную пару:
  `ssh-keygen -t ed25519 -f deploy_key -N ""`);
- `DEPLOY_PATH` — `/opt/myblhub`.

После этого каждый пуш в main деплоится сам (вкладка Actions покажет
ход). Ручной перезапуск — кнопка Run workflow (workflow_dispatch).

## Разовые прогоны данных на проде

Всё, что меняет данные (новый парсер, досинк MyDramaList, бэкфилл поля),
едет на прод **кодом**, а не дампом: коммит → деплой → запуск скрипта на
сервере. Импортёры идемпотентны (ищут по slug/tmdbId/имени и делают
upsert), поэтому один и тот же прогон локально и на проде даёт одинаковый
результат и не трогает пользовательские таблицы.

```bash
cd /opt/myblhub
docker compose exec app npx tsx scripts/mdl-sync-performers.ts
```

Образ для этого несёт `scripts/`, `src/` и `tsconfig.json` (см. Dockerfile):
скрипты импортируют `../src/lib` напрямую, а standalone-сборка исходников
не содержит.

Локальные дампы поверх прода не заливаются никогда — id у нас cuid, они
не совпадают между базами, а поверх пользовательских данных заливка
означает их потерю. Обратное направление (прод → локаль) наоборот
нормально и желательно: разработка идёт на свежей копии прод-базы.

## Место на диске

19.08.2026 сайт лёг с ENOSPC: кеш сборок Docker дорос до 37 ГБ и занял
диск целиком — приложение не могло применить миграции и падало в цикле.

Профилактика в двух местах:

- деплой после переключения образа делает `docker image prune -af` и
  `docker builder prune -af` (сборка идёт в CI, локальный кеш на сервере
  не нужен вовсе);
- `/etc/cron.d/docker-prune` — та же чистка по воскресеньям, на случай
  если деплоев долго не было.

Если диск снова кончится: `df -h /`, затем `docker system df` покажет,
что занимает; `docker builder prune -af` обычно освобождает больше
всего. После чистки `docker compose up -d`.

## Бэкапы

Перед каждым деплоем workflow снимает `backups/pre-deploy-*.sql.gz`
(хранятся 5 последних) — энтрипоинт на старте гонит `prisma migrate
deploy`, и откатывать неудачную миграцию лучше со свежего слепка, а не
с ночного.

`./backups` на сервере: 14 суточных `db-*.sql.gz` + 14 `uploads-*.tar.gz`
(~850 МБ каждый → до ~12 ГБ) + 14 `private-uploads-*.tar.gz` (билеты и
брони). Синкай каталог наружу (Hetzner Storage Box / rclone) — бэкап на
том же диске не переживёт смерть диска.

## Разовая миграция: приватные файлы (2026-08-22)

Билеты и брони отелей переехали из `public/uploads` в приватный volume
`private_uploads_data` (раздача — через `/files/…` с проверкой прав).
После первого деплоя этой версии один раз выполнить в контейнере:

```bash
docker compose exec app npx tsx scripts/migrate-private-uploads.ts
```

Скрипт идемпотентен: переносит файлы и обновляет ссылки в БД.

## Обновление вручную (без Actions)

```bash
cd /opt/myblhub && git pull && docker compose up -d --build
```
