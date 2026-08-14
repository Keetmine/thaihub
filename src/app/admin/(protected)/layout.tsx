import Link from "next/link";
import ModeToggle from "@/components/ModeToggle";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import MobileMenu from "@/components/MobileMenu";
import { logout } from "../login/actions";

function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="btn btn-ghost btn-sm">
        Выйти
      </button>
    </form>
  );
}

export default function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="d-flex flex-column flex-fill">
      <div className="container pt-4">
        <nav className="pill-nav d-flex flex-wrap align-items-center gap-2 px-3 px-sm-4 py-2">
          <Link
            href="/admin"
            prefetch={false}
            className="navbar-brand d-inline-flex align-items-center gap-2 mb-0 text-decoration-none"
          >
            <Logo />
            <span
              className="badge rounded-pill fw-semibold"
              style={{
                background: "var(--bs-primary-bg-subtle)",
                color: "var(--bs-primary-text-emphasis)",
                fontSize: "0.65rem",
              }}
            >
              ADMIN
            </span>
          </Link>

          <MobileMenu>
            <NavLink href="/admin" matchPrefixes={["/admin/events/"]}>
              События
            </NavLink>
            <NavLink href="/admin/performers" matchPrefixes={["/admin/pairings", "/admin/agencies"]}>
              Исполнители
            </NavLink>
            <NavLink href="/admin/dramas">Сериалы</NavLink>
            <NavLink href="/admin/locations">Локации</NavLink>
            <ModeToggle active="admin" />
            <LogoutButton />
          </MobileMenu>

          <div className="d-none d-sm-flex flex-wrap gap-1 ms-3">
            <NavLink href="/admin" matchPrefixes={["/admin/events/"]}>
              События
            </NavLink>
            <NavLink href="/admin/performers" matchPrefixes={["/admin/pairings", "/admin/agencies"]}>
              Исполнители
            </NavLink>
            <NavLink href="/admin/dramas">Сериалы</NavLink>
            <NavLink href="/admin/locations">Локации</NavLink>
          </div>

          <div className="d-none d-sm-flex align-items-center gap-2 ms-auto">
            <ModeToggle active="admin" />
            <LogoutButton />
          </div>
        </nav>
      </div>
      <main className="flex-fill container py-4 py-md-5">{children}</main>
    </div>
  );
}
