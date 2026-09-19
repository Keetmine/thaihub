#!/usr/bin/env bash
# Забирает свежий дамп базы с прода и заливает его в локальный Postgres
# ПОВЕРХ локальной базы (она дропается и создаётся заново).
#
# Направление только прод → локаль: локальные дампы на прод не льются
# никогда (см. docs/deploy.md).
#
#   scripts/pull-prod-db.sh                 # хост и путь — из ~/.myblhub-deploy
#   PROD_HOST=user@1.2.3.4 PROD_PATH=/srv/app scripts/pull-prod-db.sh
#   PULL_UPLOADS=1 scripts/pull-prod-db.sh  # + rsync public/uploads (~850 МБ)
#
# Локальная база берётся из DATABASE_URL в .env.
set -euo pipefail
cd "$(dirname "$0")/.."

# Хост и путь НЕ зашиты в репозиторий (он публичный): берём их из
# ~/.myblhub-deploy — файла вида
#   PROD_HOST=user@1.2.3.4
#   PROD_PATH=/путь/к/проекту
# Переменные окружения перебивают файл.
# shellcheck source=/dev/null
[ -f "$HOME/.myblhub-deploy" ] && . "$HOME/.myblhub-deploy"
if [ -z "${PROD_HOST:-}" ] || [ -z "${PROD_PATH:-}" ]; then
  echo "Не задан PROD_HOST/PROD_PATH: заполните ~/.myblhub-deploy или передайте переменными" >&2
  exit 1
fi

# --- локальная база из .env -------------------------------------------------
[ -f .env ] || { echo "нет .env — скопируй .env.example"; exit 1; }
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"'"'")"
[ -n "$DATABASE_URL" ] || { echo "в .env нет DATABASE_URL"; exit 1; }
# postgresql://user:pass@host:port/db?schema=public
proto_stripped="${DATABASE_URL#*://}"
creds="${proto_stripped%%@*}"; rest="${proto_stripped#*@}"
DB_USER="${creds%%:*}"; DB_PASS="${creds#*:}"
hostport="${rest%%/*}"; DB_HOST="${hostport%%:*}"; DB_PORT="${hostport#*:}"
[ "$DB_PORT" = "$hostport" ] && DB_PORT=5432
dbq="${rest#*/}"; DB_NAME="${dbq%%\?*}"
export PGPASSWORD="$DB_PASS"
PG=(-h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER")

# --- дамп с прода -----------------------------------------------------------
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "→ pg_dump на $PROD_HOST ..."
ssh "$PROD_HOST" "cd $PROD_PATH && docker compose exec -T db pg_dump -U thaitrack --no-owner --no-privileges thaitrack | gzip" \
  > "$tmp/prod.sql.gz"
echo "  дамп: $(du -h "$tmp/prod.sql.gz" | cut -f1)"

# --- пересоздаём локальную базу ---------------------------------------------
echo "→ пересоздаю $DB_NAME на $DB_HOST:$DB_PORT ..."
psql "${PG[@]}" -d postgres -v ON_ERROR_STOP=1 -q <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$DB_NAME";
CREATE DATABASE "$DB_NAME" OWNER "$DB_USER";
SQL
gunzip -c "$tmp/prod.sql.gz" | psql "${PG[@]}" -d "$DB_NAME" -q -v ON_ERROR_STOP=0 2>&1 \
  | grep -v "already exists" | grep -E "ERROR|FATAL" || true
echo "  таблиц: $(psql "${PG[@]}" -d "$DB_NAME" -tAc "select count(*) from information_schema.tables where table_schema='public'")"

# --- картинки (опционально) -------------------------------------------------
if [ "${PULL_UPLOADS:-0}" = "1" ]; then
  echo "→ rsync public/uploads ..."
  vol="$(ssh "$PROD_HOST" "docker volume inspect -f '{{.Mountpoint}}' \$(docker volume ls -q | grep uploads_data | grep -v private | head -1)")"
  [ -n "$vol" ] || { echo "не нашёл том uploads_data на проде"; exit 1; }
  mkdir -p public/uploads
  rsync -az "$PROD_HOST:$vol/" public/uploads/
fi

echo "→ миграции поверх дампа (если локальный код новее прода) ..."
npx prisma migrate deploy | tail -2
echo "готово"
