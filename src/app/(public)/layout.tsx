import Link from "next/link";
import ModeToggle from "@/components/ModeToggle";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import MobileMenu from "@/components/MobileMenu";
import ProfileMenu from "@/components/ProfileMenu";
import { isAdminAuthenticated } from "@/lib/auth";
import { getCurrentUser } from "@/lib/userAuth";

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
  const isAdmin = await isAdminAuthenticated();
  const fullUser = await getCurrentUser();
  // Only pass the fields ProfileMenu actually needs into the client
  // component — the full record (incl. passwordHash) would otherwise be
  // serialized into the page's RSC payload.
  const user = fullUser
    ? { id: fullUser.id, name: fullUser.name, email: fullUser.email, photoUrl: fullUser.photoUrl }
    : null;

  return (
    <div className="d-flex flex-column min-vh-100">
      <div className="ambient-wash" />
      <div className="container pt-4">
        <nav className="pill-nav d-flex flex-wrap align-items-center gap-2 px-3 px-sm-4 py-2">
          <Link href="/" prefetch={false} className="navbar-brand mb-0 text-decoration-none">
            <Logo />
          </Link>

          <MobileMenu>
            <NavLink href="/">Все события</NavLink>
            <NavLink href="/calendar">Календарь</NavLink>
            <NavLink href="/performers" matchPrefixes={["/performers/", "/agencies"]}>
              Исполнители
            </NavLink>
            <NavLink href="/dramas" matchPrefixes={["/dramas/"]}>
              Сериалы
            </NavLink>
            <NavLink href="/locations" matchPrefixes={["/locations/"]}>
              Локации
            </NavLink>
            <SearchForm />
            {user ? <ProfileMenu user={user} /> : <NavLink href="/login">Войти</NavLink>}
            {isAdmin && <ModeToggle active="site" />}
          </MobileMenu>

          <div className="d-none d-sm-flex flex-wrap gap-1 ms-3">
            <NavLink href="/">Все события</NavLink>
            <NavLink href="/calendar">Календарь</NavLink>
            <NavLink href="/performers" matchPrefixes={["/performers/", "/agencies"]}>
              Исполнители
            </NavLink>
            <NavLink href="/dramas" matchPrefixes={["/dramas/"]}>
              Сериалы
            </NavLink>
            <NavLink href="/locations" matchPrefixes={["/locations/"]}>
              Локации
            </NavLink>
          </div>

          <div className="d-none d-sm-flex align-items-center gap-2 ms-auto">
            <SearchForm />
            {user ? <ProfileMenu user={user} /> : <NavLink href="/login">Войти</NavLink>}
            {isAdmin && <ModeToggle active="site" />}
          </div>
        </nav>
      </div>
      <main className="flex-fill container py-4 py-md-5">{children}</main>
    </div>
  );
}
