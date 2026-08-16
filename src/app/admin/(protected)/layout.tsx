import Link from "next/link";
import ModeToggle from "@/components/ModeToggle";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import MobileMenu from "@/components/MobileMenu";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import { logout } from "../login/actions";
import {
  GridIcon,
  CalendarIcon,
  UsersIcon,
  TvIcon,
  PinIcon,
  CopyIcon,
  UserIcon,
} from "@/components/icons";

function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="btn btn-ghost btn-sm w-100">
        Выйти
      </button>
    </form>
  );
}

// Пункты сайдбара — единый источник и для мобильного меню.
const NAV_SECTIONS: {
  label: string | null;
  items: {
    href: string;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    matchPrefixes?: string[];
  }[];
}[] = [
  {
    label: null,
    items: [{ href: "/admin", title: "Дашборд", icon: GridIcon }],
  },
  {
    label: "Каталог",
    items: [
      {
        href: "/admin/events",
        title: "События",
        icon: CalendarIcon,
        matchPrefixes: ["/admin/events/"],
      },
      {
        href: "/admin/performers",
        title: "Исполнители",
        icon: UsersIcon,
        matchPrefixes: ["/admin/performers/", "/admin/pairings", "/admin/agencies"],
      },
      { href: "/admin/dramas", title: "Сериалы", icon: TvIcon, matchPrefixes: ["/admin/dramas/"] },
      {
        href: "/admin/locations",
        title: "Локации",
        icon: PinIcon,
        matchPrefixes: ["/admin/locations/"],
      },
    ],
  },
  {
    label: "Сервис",
    items: [
      { href: "/admin/duplicates", title: "Дубли", icon: CopyIcon },
      { href: "/admin/users", title: "Пользователи", icon: UserIcon },
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
    <div className="d-flex align-items-stretch flex-fill">
      {/* Сайдбар во всю высоту окна, вплотную к левому краю (как в
          admin-dashboard-референсах): логотип сверху, разделы с
          иконками, Сайт/Админка и выход прижаты к низу. */}
      <aside className="admin-sidebar d-none d-sm-flex flex-column flex-shrink-0">
        <Link
          href="/admin"
          prefetch={false}
          className="admin-sidebar-brand d-inline-flex align-items-center gap-2 text-decoration-none"
        >
          <Logo />
          <span className="admin-badge badge rounded-pill fw-semibold">ADMIN</span>
        </Link>

        <div className="flex-fill">
          {NAV_SECTIONS.map((section, i) => (
            <div key={i} className={i > 0 ? "mt-3" : undefined}>
              {section.label && (
                <p className="admin-sidebar-label mb-1">{section.label}</p>
              )}
              <div className="d-flex flex-column gap-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink key={item.href} href={item.href} matchPrefixes={item.matchPrefixes}>
                      <Icon className="admin-sidebar-icon" /> {item.title}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="admin-sidebar-footer d-flex flex-column gap-2 pt-3 mt-3">
          <ModeToggle active="admin" />
          <LogoutButton />
        </div>
      </aside>

      <div className="flex-fill d-flex flex-column" style={{ minWidth: 0 }}>
        {/* Мобильная шапка: сайдбар не помещается — бургер. */}
        <div className="d-sm-none nav-sticky px-3 pt-2">
          <nav className="pill-nav d-flex flex-wrap align-items-center gap-2 px-3 py-2">
            <Link
              href="/admin"
              prefetch={false}
              className="navbar-brand d-inline-flex align-items-center gap-2 mb-0 text-decoration-none"
            >
              <Logo />
              <span className="admin-badge badge rounded-pill fw-semibold">ADMIN</span>
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
          </nav>
        </div>

        <main className="admin-content flex-fill">{children}</main>
      </div>
    </div>
  );
}
