import { Fragment } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import { PUBLIC_NAV_ITEMS } from "@/components/publicNavItems";
import {
  MobileNavProvider,
  MobileMenuButton,
  MobileDrawer,
  MobileTabBar,
} from "@/components/MobileNav";
import ProfileMenu from "@/components/ProfileMenu";
import { TimezoneProvider } from "@/components/TimezoneProvider";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import NavDepthTracker from "@/components/NavDepthTracker";
import ScrollTopButton from "@/components/ScrollTopButton";
import SiteFooter from "@/components/SiteFooter";
import { getCurrentUser } from "@/lib/userAuth";
import { GridIcon, HeartIcon, SearchIcon } from "@/components/icons";
import NotificationBell from "@/components/NotificationBell";
import { unreadNotificationCount } from "@/lib/notifications";
import MobileProfileSection from "@/components/MobileProfileSection";
import ProductTour from "@/components/ProductTour";

function SearchForm() {
  return (
    <form action="/search" method="GET">
      <div className="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          name="q"
          placeholder="Поиск…"
          aria-label="Поиск по сайту"
          className="pill-search"
        />
      </div>
    </form>
  );
}

// Общий список ссылок для десктопного ряда и мобильной шторки —
// источник один (publicNavItems), рендер в двух местах.
function MainNavLinks({ loggedIn }: { loggedIn: boolean }) {
  return (
    <>
      {PUBLIC_NAV_ITEMS.filter((item) => !item.requiresUser || loggedIn).map((item) => {
        const link = (
          <NavLink href={item.href} matchPrefixes={item.matchPrefixes}>
            {item.label}
          </NavLink>
        );
        return item.tourId ? (
          <span key={item.href} data-tour={item.tourId}>
            {link}
          </span>
        ) : (
          <Fragment key={item.href}>{link}</Fragment>
        );
      })}
    </>
  );
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const fullUser = await getCurrentUser();
  const isAdmin = !!fullUser?.isAdmin;
  // Счётчик у колокольчика: приглашения в поездки и заявки в друзья
  // приходили молча, пока не появилась лента (features/notifications.md).
  const unreadNotifications = fullUser ? await unreadNotificationCount(fullUser.id) : 0;
  // Тур запускается сам, пока человек его не прошёл и не закрыл.
  const showTour = !!fullUser && !fullUser.tourCompletedAt;
  // Only pass the fields ProfileMenu actually needs into the client
  // component — the full record (incl. passwordHash) would otherwise be
  // serialized into the page's RSC payload.
  const user = fullUser
    ? {
        id: fullUser.id,
        name: fullUser.name,
        email: fullUser.email,
        photoUrl: fullUser.photoUrl,
        username: fullUser.username,
        timezone: fullUser.timezone,
      }
    : null;

  return (
    <MobileNavProvider>
      <div className="d-flex flex-column min-vh-100">
        <NavDepthTracker />
        <div className="ambient-wash" />
        <div className="container pt-4 nav-sticky">
          <nav className="pill-nav d-flex flex-wrap align-items-center gap-2 px-3 px-sm-4 py-2">
            <Link href="/" prefetch={false} className="navbar-brand mb-0 text-decoration-none">
              <Logo />
            </Link>

            {/* На мобильном частые действия живут рядом с бургером, а не
                внутри меню: раньше иконки набивались в панель вперемешку с
                пунктами навигации и выглядели случайной россыпью. */}
            <div className="d-lg-none d-flex align-items-center gap-1 ms-auto order-1">
              {user && (
                <span data-tour="notifications">
                  <NotificationBell unread={unreadNotifications} />
                </span>
              )}
              {isAdmin && (
                <Link href="/admin" prefetch={false} className="icon-btn" aria-label="Админка">
                  <GridIcon />
                </Link>
              )}
            </div>

            <div className="d-lg-none order-1">
              <MobileMenuButton />
            </div>

            {/* Полный ряд ссылок — от lg: ниже он не помещался и
                сваливался во вторую-третью строку (шапка на 600px
                вырастала до 195px). Там теперь бургер-шторка. */}
            <div className="d-none d-lg-flex flex-wrap gap-1 ms-2">
              <MainNavLinks loggedIn={!!user} />
            </div>

            <div className="d-none d-lg-flex align-items-center gap-2 ms-auto">
              <SearchForm />
              {/* На узких ноутбуках (lg) поле поиска съедает ряд —
                  вместо него иконка-ссылка на страницу поиска;
                  переключение — .nav-search-icon в globals.css. */}
              <Link
                href="/search"
                prefetch={false}
                className="icon-btn nav-search-icon"
                aria-label="Поиск"
                data-tooltip="Поиск"
              >
                <SearchIcon />
              </Link>
              {user && (
                <Link
                  href="/events?filter=favorited"
                  prefetch={false}
                  className="icon-btn"
                  aria-label="Избранное"
                  data-tooltip="Избранное"
                >
                  <HeartIcon />
                </Link>
              )}
              {user && <NotificationBell unread={unreadNotifications} />}
              {isAdmin && (
                <Link
                  href="/admin"
                  prefetch={false}
                  className="icon-btn"
                  aria-label="Админка"
                  data-tooltip="Админка"
                >
                  <GridIcon />
                </Link>
              )}
              {user ? (
                <span data-tour="profile">
                  <ProfileMenu user={user} />
                </span>
              ) : (
                <NavLink href="/login">Войти</NavLink>
              )}
            </div>
          </nav>
        </div>
        <main className="flex-fill container py-3 py-md-4 public-main">
          <TimezoneProvider timezone={user?.timezone ?? DEFAULT_TIMEZONE}>
            {children}
          </TimezoneProvider>
        </main>
        <SiteFooter />

        {/* Мобильная шторка и таб-бар — вне .pill-nav: его backdrop-filter
            сделал бы position:fixed панелей относительным навбара. */}
        <MobileDrawer>
          <MainNavLinks loggedIn={!!user} />
          <SearchForm />
          {user ? (
            <MobileProfileSection user={user} />
          ) : (
            <NavLink href="/login">Войти</NavLink>
          )}
        </MobileDrawer>
        <MobileTabBar />

        <ScrollTopButton />
        {/* Тур для новичков: показывается один раз после регистрации,
            перезапускается кнопкой в настройках. */}
        {user && <ProductTour autoStart={showTour} />}
      </div>
    </MobileNavProvider>
  );
}
