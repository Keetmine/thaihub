import Link from "next/link";
import ModeToggle from "@/components/ModeToggle";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import MobileMenu from "@/components/MobileMenu";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
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

// Пункты сайдбара — единый источник и для мобильного меню.
const NAV_SECTIONS: {
  label: string | null;
  items: { href: string; title: string; matchPrefixes?: string[] }[];
}[] = [
  {
    label: null,
    items: [{ href: "/admin", title: "Дашборд" }],
  },
  {
    label: "Каталог",
    items: [
      { href: "/admin/events", title: "События", matchPrefixes: ["/admin/events/"] },
      {
        href: "/admin/performers",
        title: "Исполнители",
        matchPrefixes: ["/admin/performers/", "/admin/pairings", "/admin/agencies"],
      },
      { href: "/admin/dramas", title: "Сериалы", matchPrefixes: ["/admin/dramas/"] },
      { href: "/admin/locations", title: "Локации", matchPrefixes: ["/admin/locations/"] },
    ],
  },
  {
    label: "Сервис",
    items: [
      { href: "/admin/duplicates", title: "Дубли" },
      { href: "/admin/users", title: "Пользователи" },
    ],
  },
];

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts проверяет только наличие куки — реальная валидация серверной
  // сессии для всех admin-страниц происходит здесь (для server actions —
  // в requireAdmin() внутри каждого экшена).
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  return (
    <div className="d-flex flex-column flex-fill">
      <div className="container pt-4 nav-sticky">
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
            {NAV_SECTIONS.flatMap((s) => s.items).map((item) => (
              <NavLink key={item.href} href={item.href} matchPrefixes={item.matchPrefixes}>
                {item.title}
              </NavLink>
            ))}
            <ModeToggle active="admin" />
            <LogoutButton />
          </MobileMenu>

          <div className="d-none d-sm-flex align-items-center gap-2 ms-auto">
            <ModeToggle active="admin" />
            <LogoutButton />
          </div>
        </nav>
      </div>
      <div className="container flex-fill py-4 py-md-5">
        <div className="d-flex align-items-start gap-4">
          {/* Сайдбар вместо горизонтального меню — пунктов будет только
              больше; на мобильных остаётся бургер в шапке. */}
          <aside className="admin-sidebar d-none d-sm-block flex-shrink-0">
            {NAV_SECTIONS.map((section, i) => (
              <div key={i} className={i > 0 ? "mt-3" : undefined}>
                {section.label && (
                  <p className="admin-sidebar-label mb-1">{section.label}</p>
                )}
                <div className="d-flex flex-column gap-1">
                  {section.items.map((item) => (
                    <NavLink key={item.href} href={item.href} matchPrefixes={item.matchPrefixes}>
                      {item.title}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </aside>
          <main className="flex-fill" style={{ minWidth: 0 }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
