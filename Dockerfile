FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Тонкий node_modules для рантайма: полный (~1 ГБ) в образ не тащим.
# --omit=dev выкидывает dev-обвязку (eslint + @typescript-eslint,
# @types/*-мусор), но НАМЕРЕННО оставляет всё, что нужно проду:
#   - prisma CLI + @prisma/engines — `prisma migrate deploy` на старте
#     контейнера (docker-entrypoint.sh) и его транзитивные deps
#     (dotenv для prisma.config.ts, c12 через @prisma/config);
#   - playwright — рантайм-скрейперы (src/lib/mdlClient.ts, blscene/GMMTV
#     в админке) делают chromium.launch() при обработке запроса;
#   - sharp, next, react и остальные прод-зависимости.
# tsx (разовые скрипты: `docker compose exec app npx tsx scripts/...`) —
# devDependency, доставляем отдельно, версию пиним из lockfile. Ставим под
# alias-именем (tsx-cli@npm:tsx): прямое `npm install tsx --omit=dev` пакет
# НЕ ставит — npm видит его в devDependencies и omit съедает даже явный
# аргумент. Бинарь всё равно линкуется как node_modules/.bin/tsx, так что
# `npx tsx` работает как раньше.
# typescript и @playwright/test npm ставит даже с --omit=dev (опциональные
# peer-deps prisma/@prisma/client и next) — рантайму они не нужны:
# prisma.config.ts грузится через c12/jiti без tsc, тестов в образе нет.
FROM node:22-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm install --no-save --no-audit --no-fund --omit=dev \
    "tsx-cli@npm:tsx@$(node -p "require('./package-lock.json').packages['node_modules/tsx'].version")" \
  && rm -rf node_modules/typescript node_modules/@playwright \
  && rm -f node_modules/.bin/playwright

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Браузеры Playwright кладём в общесистемный путь — процесс работает под
# nextjs, а ставится браузер под root'ом ниже (см. RUN после COPY
# node_modules: версия браузера обязана совпадать с версией пакета).
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The standalone build only traces runtime deps the *app* imports — the
# Prisma CLI (used below to run migrations on container start) isn't one of
# them, and neither are its own transitive deps (e.g. dotenv, c12 — verified
# by testing a `prisma migrate deploy` run with those missing, which fails).
# So on top of the standalone output we lay the prod-only node_modules from
# the prod-deps stage (same lockfile → same versions as the traced files it
# overwrites; a full superset of them, minus dev tooling).
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Chromium для рантайм-Playwright: blscene/GMMTV-кнопки админки делают
# chromium.launch() при обработке запроса — без браузера в образе они
# падают на проде. Версия браузера берётся из нашего же node_modules.
#
# Зовём cli.js пакета playwright напрямую, а НЕ node_modules/.bin/playwright:
# бинарь с этим именем объявляют оба пакета — и playwright (прод), и
# @playwright/test (dev), а npm линкует .bin на второй. Выше мы его сносим
# как dev-обвязку, и симлинк остаётся битым — сборка падала здесь с
# exit 127 «command not found» (поймано на проде 2026-08-30).
RUN node node_modules/playwright/cli.js install --with-deps chromium \
  && chmod -R a+rX /opt/pw-browsers

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Разовые прогоны данных (scripts/*.ts: досинк MyDramaList, бэкфиллы,
# импорты blscene/GMMTV/TMDB) запускаются на проде через
# `docker compose exec app npx tsx scripts/<name>.ts`. Они импортируют
# ../src/lib напрямую, а standalone-сборка исходников не содержит — без
# src и tsconfig (в нём алиас @/*) tsx падает на первом же импорте.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && chown nextjs:nodejs docker-entrypoint.sh

# Приватные загрузки (билеты, брони — см. src/lib/privateUploads.ts).
# Каталог создаём в образе с владельцем nextjs: первый маунт пустого
# named volume копирует права отсюда — иначе volume пришёл бы root'ом и
# приложение не смогло бы в него писать.
RUN mkdir -p /app/private-uploads && chown nextjs:nodejs /app/private-uploads

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
