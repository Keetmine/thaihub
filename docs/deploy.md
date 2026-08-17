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
GOOGLE_CLIENT_ID=...        # + в консоли Google redirect URI
GOOGLE_CLIENT_SECRET=...    #   https://myblhub.com/api/auth/google/callback
```
`PREMIUM_PRICE_STARS` опционален — цена правится в /admin/settings.

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

## Бэкапы

`./backups` на сервере: 14 суточных `db-*.sql.gz` + 14 `uploads-*.tar.gz`
(~850 МБ каждый → до ~12 ГБ). Синкай каталог наружу (Hetzner Storage
Box / rclone) — бэкап на том же диске не переживёт смерть диска.

## Обновление вручную (без Actions)

```bash
cd /opt/myblhub && git pull && docker compose up -d --build
```
