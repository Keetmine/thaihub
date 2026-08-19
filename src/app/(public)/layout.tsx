import Link from "next/link";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import MobileMenu from "@/components/MobileMenu";
import ProfileMenu from "@/components/ProfileMenu";
import { TimezoneProvider } from "@/components/TimezoneProvider";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import NavDepthTracker from "@/components/NavDepthTracker";
import ScrollTopButton from "@/components/ScrollTopButton";
import SiteFooter from "@/components/SiteFooter";
import { getCurrentUser } from "@/lib/userAuth";
import { GridIcon, HeartIcon } from "@/components/icons";
import NotificationBell from "@/components/NotificationBell";
import { unreadNotificationCount } from "@/lib/notifications";

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
          placeholder="Поиск..."
          className="pill-search"
        />
      </div>
    </form>
  );
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const fullUser = await getCurrentUser();
  const isAdmin = !!fullUser?.isAdmin;
  // Счётчик у колокольчика: приглашения в поездки и заявки в друзья
  // приходили молча, пока не появилась лента (features/notifications.md).
  const unreadNotifications = fullUser ? await unreadNotificationCount(fullUser.id) : 0;
  // Only pass the fields ProfileMenu actually needs into the client
  // component — the full record (incl. passwordHash) would otherwise be
  // serialized into the page's RSC payload.
  const user = fullUser
    ? {
        id: fullUser.id,
        name: fullUser.name,
        email: fullUser.email,
        photoUrl: fullUser.photoUrl,
        timezone: fullUser.timezone,
      }
    : null;

  return (
    <div className="d-flex flex-column min-vh-100">
      <NavDepthTracker />
      <div className="ambient-wash" />
      <div className="container pt-4 nav-sticky">
        <nav className="pill-nav d-flex flex-wrap align-items-center gap-2 px-3 px-sm-4 py-2">
          <Link href="/" prefetch={false} className="navbar-brand mb-0 text-decoration-none">
            <Logo />
          </Link>

          <MobileMenu>
            <NavLink href="/">Все события</NavLink>
            <NavLink href="/artists" matchPrefixes={["/artists/", "/agencies"]}>
              Исполнители
            </NavLink>
            <NavLink href="/dramas" matchPrefixes={["/dramas/"]}>
              Сериалы
            </NavLink>
            <NavLink href="/novels" matchPrefixes={["/novels/"]}>
              Новеллы
            </NavLink>
            <NavLink href="/locations" matchPrefixes={["/locations/"]}>
              Локации
            </NavLink>
            {user && (
              <NavLink href="/trips" matchPrefixes={["/trips/"]}>
                Поездки
              </NavLink>
            )}
            <SearchForm />
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
            {user && (
              <Link
                href="/?filter=favorited"
                prefetch={false}
                className="icon-btn"
                aria-label="Избранное"
              >
                <HeartIcon />
              </Link>
            )}
            {user && <NotificationBell unread={unreadNotifications} />}
            {user ? <ProfileMenu user={user} /> : <NavLink href="/login">Войти</NavLink>}
          </MobileMenu>

          <div className="d-none d-sm-flex flex-wrap gap-1 ms-3">
            <NavLink href="/">Все события</NavLink>
            <NavLink href="/artists" matchPrefixes={["/artists/", "/agencies"]}>
              Исполнители
            </NavLink>
            <NavLink href="/dramas" matchPrefixes={["/dramas/"]}>
              Сериалы
            </NavLink>
            <NavLink href="/novels" matchPrefixes={["/novels/"]}>
              Новеллы
            </NavLink>
            <NavLink href="/locations" matchPrefixes={["/locations/"]}>
              Локации
            </NavLink>
            {user && (
              <NavLink href="/trips" matchPrefixes={["/trips/"]}>
                Поездки
              </NavLink>
            )}
          </div>

          <div className="d-none d-sm-flex align-items-center gap-2 ms-auto">
            <SearchForm />
            {user && (
              <Link
                href="/?filter=favorited"
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
            {user ? <ProfileMenu user={user} /> : <NavLink href="/login">Войти</NavLink>}
          </div>
        </nav>
      </div>
      <main className="flex-fill container py-4 py-md-5">
        <TimezoneProvider timezone={user?.timezone ?? DEFAULT_TIMEZONE}>{children}</TimezoneProvider>
      </main>
      <SiteFooter />
      <ScrollTopButton />
    </div>
  );
}
