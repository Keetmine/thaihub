import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  LOCALE_COOKIE,
  LOCALE_HEADER,
  isLocale,
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
// /privacy — в списке явно, а не через финальный pass: юридическая
// страница обязана быть публичной по построению, а не по счастливому
// совпадению (что она не попадает в isPrivateSection).
// /game — мини-игра «Угадай сериал по постеру»: витринная фишка,
// открыта гостю по той же логике «явно, а не совпадением».
const PUBLIC_PATHS = new Set(["/", "/about", "/wiki", "/help", "/game", "/login", "/signup", "/terms", "/privacy", "/forgot-password", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml", "/sw.js"]);

/**
 * Переехавшие адреса: старый путь → новый, оба БЕЗ языкового префикса.
 *
 * Живут здесь, а не в `redirects()` из next.config, и это не вкусовщина.
 * Тот сравнивает СЫРОЙ путь, а русские страницы приходят с `/ru`, и
 * правило `/performers` мимо `/ru/performers` промахивалось: проверено
 * на проде — `/performers` отдаёт 308, `/ru/performers` отдавал 200 с
 * ненайденной страницей. Половина переездов молча не работала для
 * половины сайта. Здесь путь уже очищен от префикса, а `localeHref`
 * возвращает его обратно — одно правило закрывает оба языка.
 */
function movedTo(pathname: string): string | null {
  // Раздел /performers переименован в /artists.
  if (pathname === "/performers") return "/artists";
  const performer = pathname.match(/^\/performers\/([^/]+)$/);
  if (performer) return `/artists/${performer[1]}`;
  // «Популярное» удалено 2026-09-16: каталог и так сортируется по
  // популярности. Не 404: страница была открыта гостю, лежала в карте
  // сайта и успела попасть в индекс (см. docs/features/seo.md).
  if (pathname === "/dramas/top") return "/dramas";
  return null;
}

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

  // Какой язык человек хочет: явный выбор из куки (её ставит
  // переключатель), а если выбора не было — язык браузера.
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
  const preferred = isLocale(chosen)
    ? chosen
    : localeFromAcceptLanguage(request.headers.get("accept-language"));

  // Пришёл на адрес без префикса, а хочет русский — уводим на /ru.
  // Куку смотрим наравне с языком браузера, а не только при первом
  // заходе: иначе выбор жил бы до конца сессии, и по закладке, ссылке
  // со стороны или просто введённому домену человека снова выбрасывало
  // бы на английскую версию.
  //
  // Обратного правила нет намеренно: адрес с /ru — сигнал сильнее куки,
  // русскую страницу по ссылке должно быть видно и с английской кукой.
  if (isAppRoute && rawPathname === pathname && preferred === "ru") {
    const url = new URL(request.url);
    url.pathname = `/ru${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  // Переезды — до всего остального: на старом адресе нечего проверять
  // ни на права, ни на язык содержимого.
  if (isAppRoute) {
    const moved = movedTo(pathname);
    if (moved) {
      const url = new URL(request.url);
      url.pathname = localeHref(moved, locale);
      // 308, а не 307: адрес сменился навсегда, и поисковик должен
      // перенести на новый накопленный вес.
      return NextResponse.redirect(url, 308);
    }
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
      const loginUrl = new URL("/login", request.url);
      // Возврат после входа: куда шёл, туда и вернётся (админские
      // адреса без языкового префикса, pathname здесь равен raw).
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
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
  //
  // Профиль человека — туда же (правка владельца 2026-09-06): ссылкой на
  // себя делятся снаружи, и упираться в форму логина она не должна.
  // Страница написана null-safe: гость проходит по тем же веткам, что
  // залогиненный незнакомец, и видит ровно то, что владелец профиля
  // открыл посторонним (приватность считает сама страница, не прокси).
  //
  // Поездка по прямой ссылке — тоже (правка владельца 2026-09-06):
  // публичной поездкой делятся с подругами, и половина из них на сайте
  // не зарегистрирована. Закрытость считает сама страница по
  // `Trip.visibility`: приватная и «для друзей» отдают гостю 404, а
  // события афиши в публичной он видит закрытыми карточками — списки
  // под подпиской. Сам /trips (кабинетный список своих) остаётся за
  // логином.
  if (/^\/(lists|artist-lists|wiki|reset-password|users|trips)\/[^/]+$/.test(pathname)) {
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
    // Возврат после входа: исходный путь (без языкового префикса — его
    // подставит обратно localeHref в экшене входа) кладём в ?next=.
    // Query сохраняем тоже: фильтры страницы — часть адреса. Валидацию
    // не делаем здесь — значение всё равно перепроверит sanitizeNextPath
    // на форме и в экшене (URL может прийти и не от прокси).
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
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
