import Link from "next/link";
import ModeToggle from "@/components/ModeToggle";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import { logout } from "../login/actions";

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

          <div className="d-flex flex-wrap gap-1 order-3 order-sm-2 ms-sm-3">
            <NavLink href="/admin" matchPrefixes={["/admin/events/"]}>
              События
            </NavLink>
            <NavLink href="/admin/performers">Исполнители</NavLink>
          </div>

          <div className="d-flex align-items-center gap-2 order-2 order-sm-3 ms-sm-auto">
            <ModeToggle active="admin" />
            <form action={logout}>
              <button type="submit" className="btn btn-ghost btn-sm">
                Выйти
              </button>
            </form>
          </div>
        </nav>
      </div>
      <main className="flex-fill container py-4 py-md-5">{children}</main>
    </div>
  );
}
