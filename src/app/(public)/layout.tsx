import Link from "next/link";
import ModeToggle from "@/components/ModeToggle";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import { isAdminAuthenticated } from "@/lib/auth";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await isAdminAuthenticated();

  return (
    <div className="d-flex flex-column min-vh-100">
      <div className="ambient-wash" />
      <div className="container pt-4">
        <nav className="pill-nav d-flex flex-wrap align-items-center gap-2 px-3 px-sm-4 py-2">
          <Link href="/" className="navbar-brand mb-0 text-decoration-none">
            <Logo />
          </Link>

          <div className="d-flex flex-wrap gap-1 order-3 order-sm-2 ms-sm-3">
            <NavLink href="/">Все события</NavLink>
            <NavLink href="/calendar">Календарь</NavLink>
            <NavLink href="/performers" matchPrefixes={["/performers/"]}>
              Исполнители
            </NavLink>
          </div>

          <div className="d-flex align-items-center gap-2 order-2 order-sm-3 ms-sm-auto">
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
            {isAdmin && <ModeToggle active="site" />}
          </div>
        </nav>
      </div>
      <main className="flex-fill container py-4 py-md-5">{children}</main>
    </div>
  );
}
