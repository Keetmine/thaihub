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
# Copying the full node_modules is simpler and safer than chasing every
# transitive dep by hand.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Chromium для рантайм-Playwright: blscene/GMMTV-кнопки админки делают
# chromium.launch() при обработке запроса — без браузера в образе они
# падают на проде. Версия браузера берётся из нашего же node_modules.
RUN node_modules/.bin/playwright install --with-deps chromium \
  && chmod -R a+rX /opt/pw-browsers

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && chown nextjs:nodejs docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
