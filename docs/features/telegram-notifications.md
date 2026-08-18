# Telegram event reminders

The same bot that powers [Telegram login](auth.md) DMs users about
upcoming events. Requires `TELEGRAM_BOT_TOKEN`; `APP_URL` (absolute
origin) additionally makes the messages carry a link to the event page.

## Who gets what

Every user with a linked `telegramId` who marked an event "я иду"
(`EventAttendance`) **or** favorited it (`FavoriteEvent`) gets one
reminder per `EventOccurrence` starting within the next 24 hours —
i.e. a 3-day concert produces up to three reminders, one per date, which
is the point (each date is its own "don't miss it").

- **Dedup**: `TelegramNotification` (`@@id([userId, occurrenceId])`) —
  a row is written right after a send attempt, so the half-hourly job
  never re-sends. A 403 from Telegram (user never pressed Start on the
  bot) is also recorded — retrying an unreachable chat every 30 minutes
  would just burn API calls. Send *errors* (network etc.) are **not**
  recorded, so those retry next run.
- Users must press **Start** on the bot once for DMs to work — Telegram
  forbids bots from initiating chats. Logging in via the widget does not
  by itself open the chat.

## Scheduling

`src/instrumentation.ts` (`register()`, Next's server-startup hook) arms
a 30-minute `setInterval` calling `sendUpcomingEventReminders`
(`src/lib/telegramNotifications.ts`) — first run one minute after boot.
No external cron: the docker-compose deploy is a single always-on app
container, so an in-process timer is the simplest reliable place. The
whole thing no-ops when `TELEGRAM_BOT_TOKEN` is unset.

## Other notifications

The same half-hourly job also sends: **presale reminders** («продажа
открывается через час», `sendPresaleReminders` — favorited/going users
with Telegram *and an active subscription*, dedup in
`TelegramPresaleNotification` per (user, event)) and **premium expiry
reminders** (3 days before `premiumUntil`, dedup via
`premiumExpiryNotifiedFor`). Separately, `notifyFriendsAboutGoing` fires
from `toggleGoing` (fire-and-forget) — «X идёт на …» to the actor's
friends, unless a friend muted them (`FriendNotificationMute`, toggled
by the bell button on the friend's profile page); receivers also need
Telegram + active premium.

## Payments webhook

`/api/telegram/webhook` (registered once via
`scripts/setup-telegram-webhook.ts`, authenticated by
`TELEGRAM_WEBHOOK_SECRET` header) handles Telegram Stars subscription
payments: `pre_checkout_query` is confirmed if the payload (our userId,
embedded by `createPremiumInvoiceLink`) resolves to a user;
`successful_payment` extends `premiumUntil` by 30 days
(`extendPremium`), links `telegramId` if missing, and thanks the payer.
The paywall (`PremiumUpsell` → `BuyPremiumButton` →
`getPremiumInvoiceLink`) opens the invoice link in Telegram.

## Files

- `src/lib/telegram.ts` — bot API client: `verifyTelegramAuth` (login
  widget HMAC check), `sendTelegramMessage` (returns `false` on 403
  instead of throwing).
- `src/lib/telegramNotifications.ts` — all reminder sweeps + friend
  notifications.
- `src/instrumentation.ts` — the timer.

## Команды бота

`/start`, `/terms`, `/support` — обрабатываются в
`src/app/api/telegram/webhook/route.ts`, список для кнопки «Меню»
регистрируется скриптом `scripts/setup-telegram-commands.ts` (разовый
запуск, как и вебхук).

`/terms` и `/support` обязательны для ботов, принимающих Telegram Stars
(Live Checklist в core.telegram.org/bots/payments-stars). Оттуда же ещё
одно требование, которое кодом не закрыть: **на аккаунте-владельце бота
должна быть включена двухэтапная аутентификация** — без неё оплата
падает с `PROVIDER_ACCOUNT_INVALID`. Условия лежат на `/terms`.
