# Architecture

## Stack

- **Next.js 16** (App Router, TypeScript), server components by default,
  server actions (`"use server"`) for all writes — no separate REST/API
  layer except a couple of route handlers that genuinely need to be raw
  HTTP endpoints (ICS export/feed, file upload).
- **Prisma 7** + `@prisma/adapter-pg` against a **PostgreSQL** database
  (not SQLite — that was only true very early in the project). Client is
  generated to `src/generated/prisma` (custom `output` in
  `prisma/schema.prisma`), imported as `@/generated/prisma/client`.
- **Bootstrap 5**, dark-themed via CSS custom-property overrides in
  `src/app/globals.css`, Space Grotesk as the display font. Two accent
  colors: orange for the public site, violet scoped to `.admin-shell` for
  admin.
- **Leaflet + react-leaflet** for the locations map (OpenStreetMap tiles,
  no API key). See [locations.md](features/locations.md).
- **Playwright** — both a runtime dependency (the blscene importer drives
  a real browser to resolve Google Maps short links) and a dev dependency
  (`@playwright/test`, the smoke suite). See [testing.md](testing.md).

## Route layout

One app, two route groups, both under the same Next.js project:

- `src/app/(public)/*` — the fan-facing site. Gated behind a real user
  session for everything except `/`, `/login`, `/signup` (see
  [auth.md](features/auth.md)); `/` itself renders a marketing landing
  page instead of the event feed when logged out.
- `src/app/admin/*` — CRUD admin. `src/app/admin/layout.tsx` wraps
  everything (just applies the violet admin theme class); `src/app/admin/(protected)/*`
  is the actual authenticated admin area, gated by the `User.isAdmin`
  role (no separate admin login — see [auth.md](features/auth.md)).
  The protected layout is an admin-panel shell: a
  left sidebar (`.admin-sidebar`, section-grouped links; burger menu on
  mobile) next to the content. `/admin` itself is the dashboard, the
  events list lives at `/admin/events`.
- `src/app/api/*` — route handlers for things that aren't page navigations:
  file upload, the per-event `.ics` download, the per-user `.ics`
  subscribe feed.

Auth gating happens in `src/proxy.ts` (this Next.js version's replacement
for `middleware.ts`) — see [auth.md](features/auth.md) for exactly what it
does and doesn't check.

## Conventions

- **`export const dynamic = "force-dynamic"`** on every page that reads
  Prisma directly without another dynamic API — otherwise Next prerenders
  it at build time and it goes stale. Apply this to any new data-reading
  page.
- **Server actions live in `actions.ts`** next to the pages/forms that use
  them (e.g. `src/app/admin/(protected)/events/actions.ts`), not in a
  shared actions file. Shared, reusable *read* logic goes in `src/lib/*`
  instead (`favorites.ts`, `friends.ts`, `duplicates.ts`, etc.).
- **Forms are client components wrapping a server action** passed in as
  the `action` prop from the page (server component), so the same form
  component works for both create and edit — presence of `defaultValues`
  toggles create-vs-edit behavior.
- **`ConfirmForm`** (`src/components/ConfirmForm.tsx`) wraps a delete
  button in a custom in-app confirmation modal (not a native
  `window.confirm()`). The click is intercepted by a `display: contents`
  wrapper span, NOT by `cloneElement` on the child — cloning an element
  that arrived through the RSC stream silently dropped the `onClick`
  after client-side navigation (direct loads worked, so the modal only
  "sometimes" failed to open). The wrapper does not rewrite the
  trigger's `type`, so always write `type="button"` on the JSX passed as
  its child, never `type="submit"` (both a hydration-mismatch bug and
  accidental form submits came from that historically).
- **`EntitySelect` / `EntityMultiSelect`** (`src/components/`) are the
  standard custom dropdown/combobox components used everywhere instead of
  native `<select>` — they take `{id, name, photoUrl?}` options and
  support inline "create new" via a callback. For catalogs too big to
  ship to the client, `EntityMultiSelect` has an async `searchOptions`
  mode — see "Async performer search" in
  [features/catalog.md](features/catalog.md). It also has an `onPick`
  picker mode (with `excludeIds`) where it stores no selection and
  renders no chips/hidden inputs — each picked option goes to the
  parent, for selections that carry extra per-entry fields (drama cast
  with roles, per-day event lineups). There are no hand-rolled
  comboboxes left in the admin forms.
- **`DatePickerInput`** (`src/components/DatePickerInput.tsx`) is the
  standard date field — no native `<input type="date">` anywhere (native
  pickers look different per browser/OS, and Thai-locale ones round-trip
  Buddhist-era years, see `normalizeYear` in `src/lib/dates.ts`). It
  submits a canonical `YYYY-MM-DD` via a hidden input under `name`,
  shows ДД.ММ.ГГГГ in a visible (controlled, keyboard-inert but
  `required`-validatable) text field, and renders its calendar through a
  `createPortal` to `<body>` with fixed positioning + a flip-up near the
  viewport bottom — absolute positioning inside a parent got clipped by
  scrollable ancestors (`.modal-panel { overflow-y: auto }`). Supports
  both uncontrolled (`defaultValue`) and controlled (`value` +
  `onValueChange`) use; controlled is required inside index-keyed row
  lists (EventForm's occurrence rows) where internal state would stick
  to the position rather than the row.
- **`SectionHeading`** (`src/components/SectionHeading.tsx`) / класс
  `.section-heading` — единый заголовок секции (бывшая копипаста "small
  text-secondary text-uppercase" + inline letterSpacing в 40+ местах);
  опциональные `icon` и `action` (контрол справа). **`StatTile`**
  (`src/components/StatTile.tsx`) — общая плитка-счётчик (кабинет,
  профиль, админ-дашборд). Утилита `.thin-scroll` — тонкий кастомный
  скроллбар (горизонтальные ленты постеров, внутренний список
  DatePickerInput). Классов `.scroll-list`/`.scroll-list-lg` больше нет:
  вертикальные списки не прокручиваются внутри блока — страница
  скроллится целиком окном (фидбек владельца).
  `.nav-sticky` — закреплённая шапка с непрозрачной подложкой в
  обоих layout'ах. Иконки (`icons.tsx`) — единый stroke-стиль,
  currentColor (у PinIcon больше НЕТ зашитого красного).
- **`.tab-bar-row`** (`globals.css`) is the standard layout for a list page
  that has both underline tabs and a search box: tabs on the left, a
  `NameSearchBox` on the right, sharing one bottom border. Used on every
  admin and public catalog list (performers, dramas, locations, the home
  page's Все/Иду/Избранное). When nesting a tabs component inside it,
  drop that component's own `mb-4`/border spacing — `.tab-bar-row .tab-bar`
  already zeroes it — and pass `className=""` to `NameSearchBox` so it
  doesn't add its own standalone margin. Подпись вкладки не переносится
  (`white-space: nowrap`), поэтому длинную — а на `/locations` вкладки
  называет сам пользователь (это его списки мест) — обрезаем многоточием
  по ширине ряда: `.tab-bar` держит `min-width: 0` (иначе ряд не сожмётся
  уже содержимого и уедет за край экрана), `.tab-bar-item` — `max-width:
  100%` и `overflow: clip` с запасом `overflow-clip-margin`, чтобы
  полоска активной вкладки (`bottom: -1px`) не обрезалась. Обычные
  короткие вкладки ограничение не задевает.
- **`ScrollableTabs`** (`src/components/ScrollableTabs.tsx`) — сам ряд
  вкладок внутри `.tab-bar-row`, когда он может не поместиться:
  вместо `<div className="tab-bar">` пишем `<ScrollableTabs>` с теми же
  `.tab-bar-item` внутри, поиск и кнопки остаются соседями по строке.
  Ряд не заворачивается, а прокручивается: край растушёван маской, на
  устройстве с курсором появляются кнопки «влево/вправо», активная
  вкладка подтягивается в видимую часть. Компонент клиентский, но дети
  приходят пропсом — серверные ряды остаются обычными ссылками и без
  JS. Механизм ОДИН на весь сайт (профиль, сообщество, витрина
  сообществ, афиша, каталоги, агентство, поездка); подробности — в
  [features/social.md](features/social.md), раздел «Ряд вкладок».
  `dense` — поджатый шаг для рядов на десяток вкладок.
- **Inline text-row icons default to `0.95em`/`strokeWidth: 2`**
  (`src/components/icons.tsx`) — that's what keeps a line like "📍
  Локация: …" and "📅 Дата и время: …" visually matched. A few icons
  (`TvIcon`) also see standalone use at a deliberately larger native size
  (e.g. `LandingPage`'s feature list) — when reusing one of those inline
  instead, pass `className="icon-inline"` (`globals.css`) rather than
  wrapping it in a `<span style={{fontSize}}>`, which compounds instead of
  overriding and was a real source of misaligned icons on the event page.

## Known gotchas

- **Lightning CSS** (Turbopack's default CSS processor) silently drops
  **both** `backdrop-filter` and a manually-adjacent
  `-webkit-backdrop-filter` if you write both on the same rule. Write only
  the unprefixed `backdrop-filter` and let Lightning CSS auto-prefix.
- **`next/dynamic({ ssr: false })` is not allowed directly inside an async
  Server Component** in this Next.js version. If you need a client-only
  dynamic import from a Server Component page, put the `dynamic(...)` call
  inside a small `"use client"` wrapper component instead (see
  `src/components/LocationMapLoader.tsx`) and import that wrapper from the
  page.
- **The generated Prisma client is ESM-only** and Playwright Test's own
  module loader can't import it directly inside a `*.spec.ts` file. Any
  test that needs direct DB access shells out to a separate `tsx` process
  instead (see `tests/e2e/cleanup-test-user.ts` and its usage in
  `tests/e2e/favorites.spec.ts`) rather than `import`-ing `@/lib/prisma`
  into the test file itself.
- **After changing `prisma/schema.prisma` and running `prisma generate`,
  restart the dev server.** A `next dev` process that started before the
  regenerate keeps the stale client in memory and throws
  `PrismaClientValidationError: Unknown field ...` for anything on the new
  field/model until it's restarted.
- **`src/proxy.ts`'s matcher must exclude anything the browser/OS fetches
  without a session cookie** — static assets, uploaded files, and PWA
  icons/manifest all need to bypass the login redirect or they come back
  as login-page HTML instead of the real asset. See the `matcher` config
  and `PUBLIC_PATHS` in `src/proxy.ts`.
- This Next.js version's own docs live in `node_modules/next/dist/docs/`
  and are worth checking before assuming default Next.js behavior — file
  conventions, deprecations, and APIs have real differences from training
  data (e.g. `proxy.ts` replacing `middleware.ts`, `viewport`/`themeColor`
  living in a separate `viewport` export rather than `metadata`).

## Часовые пояса

Каждое событие MyBLHub — тайское, и в базе лежит тайское **настенное**
время без зоны: `19:00` значит 19:00 в Бангкоке. Prisma отдаёт такой
timestamp как момент в UTC, поэтому читать его нужно UTC-компонентами
(`getUTCHours()` и т.д.) — этим занимается `src/lib/dates.ts`.

Локальные `getHours()/getDate()` использовать нельзя: они дают разный
результат на сервере и в браузере. До перехода на UTC-компоненты время
уезжало на 3 часа, у вечерних событий дата — на сутки, конвертация в
зону зрителя врала на 7 часов, а React ругался на несовпадение
разметки (ошибка гидратации #418).

Зона самого процесса задаётся `TZ=Europe/Moscow` (docker-compose) — на
время событий она не влияет, но системные даты (`createdAt`,
`premiumUntil`) показываются в зоне аудитории.
