import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  localeFromAcceptLanguage,
  localeHref,
  stripLocale,
} from "@/lib/i18n/config";

// Kept import-free (no Prisma) on purpose: Proxy runs on every route,
// including prefetched ones, so per the Next.js docs it should only do an
// "optimistic" cookie-presence check here — no DB round-trip. Real
// authorization (validating the session against the DB) happens in the
// Data Access Layer: getCurrentUser() in src/lib/userAuth.ts, called by the
// pages/actions that actually need a verified identity.
const USER_COOKIE = "user_session";

// Routes reachable without being logged in: the marketing landing page
// (which itself renders the real event feed once you ARE logged in — see
// src/app/(public)/page.tsx) and the auth forms themselves.
const PUBLIC_PATHS = new Set(["/", "/about", "/wiki", "/help", "/login", "/signup", "/terms", "/forgot-password", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml", "/sw.js"]);

export function proxy(request: NextRequest) {
  const { pathname: rawPathname } = request.nextUrl;

  // ЯЗЫК. Английский живёт на адресах без префикса (они уже
  // проиндексированы), русский — под `/ru`. Русские страницы отдаём
  // рерайтом на те же маршруты, чтобы не заводить второе дерево
  // файлов; язык кладём в заголовок — из пути его уже не прочитать.
  const stripped = stripLocale(rawPathname);
  const pathname = stripped.path;
  // Админка одноязычная — русская. Она живёт на адресах без префикса,
  // поэтому по умолчанию получила бы английский, и общие виджеты
  // (пагинация, подтверждения, модалки) заговорили бы там по-английски.
  const locale = pathname.startsWith("/admin") ? "ru" : stripped.locale;
  const isAppRoute =
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/files") &&
    !pathname.startsWith("/admin") &&
    !/\.[a-z0-9]+$/i.test(pathname);

  // Первый заход без явного выбора: если браузер просит русский —
  // уводим на /ru. Дальше решает кука, которую ставит переключатель.
  if (
    isAppRoute &&
    locale === DEFAULT_LOCALE &&
    rawPathname === pathname &&
    !request.cookies.get(LOCALE_COOKIE)?.value &&
    localeFromAcceptLanguage(request.headers.get("accept-language")) === "ru"
  ) {
    const url = new URL(request.url);
    url.pathname = `/ru${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  const withLocale = (res: NextResponse) => {
    res.headers.set(LOCALE_HEADER, locale);
    return res;
  };
  // Дальше вся защита смотрит на путь БЕЗ префикса, а ответ —
  // рерайт на него же: /ru/events рисует тот же маршрут /events.
  const pass = () => {
    if (rawPathname === pathname) return withLocale(NextResponse.next());
    const url = new URL(request.url);
    url.pathname = pathname;
    return withLocale(NextResponse.rewrite(url));
  };

  if (pathname.startsWith("/admin")) {
    // Админка — это роль пользователя (User.isAdmin), отдельного логина
    // нет. Тут только optimistic-проверка наличия user-куки (без БД —
    // proxy бежит на каждый запрос); реальная проверка роли — в
    // isAdminAuthenticated()/requireAdmin(), которые вызывают
    // admin-layout и каждый admin server action.
    if (!request.cookies.get(USER_COOKIE)?.value) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return pass();
  }

  // API routes handle their own auth internally (they're called via
  // fetch/form-submit, not navigated to — a redirect response would just
  // confuse the caller rather than send a person anywhere).
  if (pathname.startsWith("/api")) {
    return pass();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return pass();
  }

  // Публичные списки мест шарятся наружу прямой ссылкой — /lists/{id}
  // пропускаем без куки, страница сама отдаёт 404/редирект по видимости
  // (сам /lists — кабинетный список СВОИХ, остаётся за логином).
  if (/^\/(lists|artist-lists|wiki|reset-password)\/[^/]+$/.test(pathname)) {
    return pass();
  }

  // Каталог открыт без логина ради SEO: сериалы, исполнители, события,
  // локации, новеллы, агентства, поиск. Страницы написаны null-safe
  // (getCurrentUser() → null), а действия («в избранное», «иду») сами
  // редиректят анонима на /login. Личное (аккаунт, поездки, списки,
  // друзья, календарь) остаётся за логином.
  if (/^\/(artists|dramas|novels|locations|agencies|day|event|events|search)(\/.*)?$/.test(pathname)) {
    return pass();
  }

  // Calendar-export links (event/[id]/ics) are meant to be handed to
  // external calendar apps (Google/Apple/Outlook "subscribe by URL"), which
  // fetch them directly and never carry our session cookie.
  if (pathname.startsWith("/event/") && pathname.endsWith("/ics")) {
    return pass();
  }

  // Гостя уводим на логин только с ЗАКРЫТЫХ разделов. Раньше сюда падал
  // и любой несуществующий адрес — опечатка в ссылке приводила на форму
  // входа вместо «страница не найдена», а поисковик вместо 404 получал
  // редирект.
  const isPrivateSection =
    /^\/(account|trips|lists|artist-lists|friends|calendar|users|welcome|places)(\/.*)?$/.test(
      pathname,
    );
  if (isPrivateSection && !request.cookies.get(USER_COOKIE)?.value) {
    const loginUrl = new URL(localeHref("/login", locale), request.url);
    return NextResponse.redirect(loginUrl);
  }

  return pass();
}

export const config = {
  // Everything except static assets, image optimization, and files served
  // straight out of /public (favicon, uploaded photos/posters/logos, PWA
  // icons — the OS/browser fetches these without our session cookie).
  // leaflet/ — иконки маркеров карты: без исключения гость получал на них
  // редирект на логин, и карта рисовалась с 860 битыми картинками.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/|icons/|leaflet/|og-default).*)"],
};
