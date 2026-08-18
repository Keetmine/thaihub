import Link from "next/link";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import MobileMenu from "@/components/MobileMenu";
import ScrollTopButton from "@/components/ScrollTopButton";
import { redirect } from "next/navigation";
import { isAdminAuthenticated, isCatalogEditor } from "@/lib/auth";
import {
  GridIcon,
  CalendarIcon,
  UsersIcon,
  TvIcon,
  PinIcon,
  CopyIcon,
  UserIcon,
  BookIcon,
  ChatIcon,
  FlagIcon,
  MegaphoneIcon,
  ChartIcon,
  StarIcon,
  ImportIcon,
  SettingsIcon,
} from "@/components/icons";

// Пункты сайдбара — единый источник и для мобильного меню.
const NAV_SECTIONS: {
  label: string | null;
  items: {
    href: string;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    matchPrefixes?: string[];
    /** Раздел доступен менеджеру каталога (иначе — только админу). */
    managerOk?: boolean;
  }[];
}[] = [
  {
    label: null,
    items: [{ href: "/admin", title: "Дашборд", icon: GridIcon, managerOk: true }],
  },
  {
    label: "Каталог",
    items: [
      {
        href: "/admin/events",
        managerOk: true,
        title: "События",
        icon: CalendarIcon,
        matchPrefixes: ["/admin/events/"],
      },
      {
        href: "/admin/performers",
        managerOk: true,
        title: "Исполнители",
        icon: UsersIcon,
        matchPrefixes: ["/admin/performers/", "/admin/pairings", "/admin/agencies"],
      },
      { href: "/admin/dramas", title: "Сериалы", icon: TvIcon, matchPrefixes: ["/admin/dramas/"], managerOk: true },
      { href: "/admin/novels", title: "Новеллы", icon: BookIcon, matchPrefixes: ["/admin/novels/"], managerOk: true },
      {
        href: "/admin/locations",
        managerOk: true,
        title: "Локации",
        icon: PinIcon,
        matchPrefixes: ["/admin/locations/"],
      },
    ],
  },
  {
    label: "Коммьюнити",
    items: [
      { href: "/admin/users", title: "Пользователи", icon: UserIcon, matchPrefixes: ["/admin/users/"] },
      { href: "/admin/feedback", title: "Обращения", icon: ChatIcon },
      { href: "/admin/moderation", title: "Модерация", icon: FlagIcon },
      { href: "/admin/broadcast", title: "Рассылки", icon: MegaphoneIcon },
      { href: "/admin/wiki", title: "Вики", icon: BookIcon, matchPrefixes: ["/admin/wiki/"] },
    ],
  },
  {
    label: "Сервис",
    items: [
      { href: "/admin/analytics", title: "Аналитика", icon: ChartIcon },
      { href: "/admin/finance", title: "Финансы", icon: StarIcon },
      { href: "/admin/imports", title: "Импорты", icon: ImportIcon, managerOk: true },
      { href: "/admin/errors", title: "Ошибки", icon: FlagIcon },
      { href: "/admin/duplicates", title: "Дубли", icon: CopyIcon, managerOk: true },
      { href: "/admin/settings", title: "Настройки", icon: SettingsIcon },
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
  // в requireAdmin()/requireCatalogEditor() внутри каждого экшена).
  // Менеджер каталога видит только каталожные разделы.
  const isAdmin = await isAdminAuthenticated();
  const isEditor = isAdmin || (await isCatalogEditor());
  if (!isEditor) {
    redirect("/");
  }
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: isAdmin ? section.items : section.items.filter((i) => i.managerOk),
  })).filter((section) => section.items.length > 0);

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
          <span className="admin-badge badge rounded-pill fw-semibold">{isAdmin ? "ADMIN" : "MANAGER"}</span>
        </Link>

        <div className="flex-fill">
          {sections.map((section, i) => (
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

        <div className="admin-sidebar-footer d-flex flex-column gap-1 pt-3 mt-3">
          <Link href="/" prefetch={false} className="nav-link">
            ← На сайт
          </Link>
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
              <span className="admin-badge badge rounded-pill fw-semibold">{isAdmin ? "ADMIN" : "MANAGER"}</span>
            </Link>
            <MobileMenu>
              {sections.flatMap((s) => s.items).map((item) => (
                <NavLink key={item.href} href={item.href} matchPrefixes={item.matchPrefixes}>
                  {item.title}
                </NavLink>
              ))}
              <Link href="/" prefetch={false} className="nav-link">
                ← На сайт
              </Link>
            </MobileMenu>
          </nav>
        </div>

        <main className="admin-content flex-fill">{children}</main>
        <ScrollTopButton />
      </div>
    </div>
  );
}
