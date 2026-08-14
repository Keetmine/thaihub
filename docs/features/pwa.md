# PWA manifest

Makes the site installable ("Add to Home Screen") on phones — no offline
support, no service worker, just the manifest + icons + theme color.

- **`src/app/manifest.ts`** — Next's `MetadataRoute.Manifest` file
  convention, served at `/manifest.webmanifest`. Name, short description,
  standalone display mode, dark background/theme color matching the app's
  own dark theme, and two icon sizes.
- **`public/icons/icon-192.png`** / **`icon-512.png`** — generated once
  by rendering the app's existing brand mark (the pin+dot from
  `src/components/Logo.tsx`) to HTML and screenshotting it with
  Playwright at each size (no image-editing tool involved — see git
  history around when this was added if you need to regenerate them at a
  different size).
- **`src/app/layout.tsx`** — `metadata.icons` (favicon + apple-touch-icon,
  both pointing at the 192px icon) and a separate `viewport` export for
  `themeColor` (this Next.js version deprecated `metadata.themeColor` in
  favor of a dedicated `viewport` export — see
  [architecture.md](../architecture.md)).

## The gotcha this ran into

`/manifest.webmanifest` and everything under `/icons/` need to be
fetchable **without a session cookie** — the browser/OS requests them on
its own, and a logged-out visitor on the public landing page should still
get a working install prompt. `src/proxy.ts`'s login gate originally
didn't know about either path, so both came back as login-page HTML
instead of the real manifest/icon. Fixed by adding
`/manifest.webmanifest` to `PUBLIC_PATHS` and `icons/` to the matcher's
exclusion list, the same way `uploads/` was already excluded for the same
reason. If you add another asset path under `/public/` that needs to be
fetched cookie-free, it needs the same treatment.
