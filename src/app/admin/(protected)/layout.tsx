import type { Metadata } from "next";
import Link from "next/link";
import QuickSearch from "@/components/admin/QuickSearch";
import QuickSearchButton from "@/components/admin/QuickSearchButton";
import Logo from "@/components/Logo";
import NavLink from "@/components/NavLink";
import MobileMenu from "@/components/MobileMenu";
import ScrollTopButton from "@/components/ScrollTopButton";
import { redirect } from "next/navigation";
import { isAdminAuthenticated, isCatalogEditor } from "@/lib/auth";
import { adminBadgeCounts } from "@/lib/adminNotify";
import {
  GridIcon,
  CalendarIcon,
  UsersIcon,
  HeartIcon,
  BuildingIcon,
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
  TrophyIcon,
  ImportIcon,
  SettingsIcon,
  HistoryIcon,
  ClockIcon,
  MusicNoteIcon,
} from "@/components/icons";

// Пункты сайдбара — единый источник и для мобильного меню.
const NAV_SECTIONS: {
  label: string | null;
  items: {
    href: string;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    matchPrefixes?: string[];
    matchQuery?: Record<string, string | null>;
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
        title: "Актёры",
        icon: UsersIcon,
        matchPrefixes: ["/admin/performers/"],
        // ?view=bands|mascots — свои пункты ниже, актёров не подсвечиваем.
        matchQuery: { view: null },
      },
      {
        href: "/admin/performers?view=bands",
        managerOk: true,
        title: "Группы",
        icon: MusicNoteIcon,
        matchQuery: { view: "bands" },
      },
      {
        href: "/admin/performers?view=mascots",
        managerOk: true,
        title: "Маскоты",
        icon: StarIcon,
        matchQuery: { view: "mascots" },
      },
      {
        href: "/admin/pairings",
        managerOk: true,
        title: "Пейринги",
        icon: HeartIcon,
      },
      {
        href: "/admin/agencies",
        managerOk: true,
        title: "Агентства",
        icon: BuildingIcon,
        matchPrefixes: ["/admin/agencies/"],
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
      // Сообщества — чужой контент на нашем домене, и закрытых не видно
      // ниоткуда: ни витрина, ни поиск, ни карта сайта их не показывают.
      // Без своего пункта меню о них можно было узнать только по жалобе.
      {
        href: "/admin/communities",
        title: "Сообщества",
        icon: UsersIcon,
        matchPrefixes: ["/admin/communities/"],
      },
      { href: "/admin/achievements", title: "Достижения", icon: TrophyIcon, matchPrefixes: ["/admin/achievements/"] },
      { href: "/admin/broadcast", title: "Рассылки", icon: MegaphoneIcon },
      { href: "/admin/wiki", title: "Вики", icon: BookIcon, matchPrefixes: ["/admin/wiki/"] },
    ],
  },
  {
    label: "Бизнес",
    items: [
      { href: "/admin/analytics", title: "Аналитика", icon: ChartIcon },
      { href: "/admin/finance", title: "Финансы", icon: StarIcon },
      { href: "/admin/translations", title: "Словарь каталога", icon: BookIcon },
      { href: "/admin/settings", title: "Настройки", icon: SettingsIcon },
    ],
  },
  {
    label: "Система",
    items: [
      { href: "/admin/imports", title: "Импорты", icon: ImportIcon, managerOk: true },
      { href: "/admin/schedule", title: "Расписание", icon: ClockIcon },
      { href: "/admin/errors", title: "Ошибки", icon: FlagIcon },
      { href: "/admin/duplicates", title: "Дубли", icon: CopyIcon, managerOk: true },
      { href: "/admin/history", title: "История правок", icon: HistoryIcon, managerOk: true },
    ],
  },
];

// Заголовки вкладок админки: у всех страниц был один «MyBLHub», и пять
// открытых вкладок выглядели одинаково. Шаблон дописывает раздел к
// названию, страницы задают только свою часть.
export const metadata: Metadata = {
  title: {
    default: "Админка — MyBLHub",
    template: "%s · Админка — MyBLHub",
  },
  robots: { index: false, follow: false },
};

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
  // Бейджи очередей: сколько ждёт разбора в обращениях, модерации,
  // импортах и ошибках. Менеджеру каталога видны только его разделы.
  const badges = isAdmin ? await adminBadgeCounts() : {};
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: isAdmin ? section.items : section.items.filter((i) => i.managerOk),
  })).filter((section) => section.items.length > 0);

  return (
    // Язык админки (всегда русский) ставит proxy заголовком — и
    // серверным компонентам, и провайдеру в корневом layout.
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

        <QuickSearchButton />

        <div className="flex-fill">
          {sections.map((section, i) => (
            <div key={i} className={i > 0 ? "mt-3" : undefined}>
              {section.label && (
                <p className="admin-sidebar-label mb-1">{section.label}</p>
              )}
              <div className="d-flex flex-column gap-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const badge = badges[item.href] ?? 0;
                  return (
                    <NavLink key={item.href} href={item.href} matchPrefixes={item.matchPrefixes} matchQuery={item.matchQuery}>
                      <Icon className="admin-sidebar-icon" /> {item.title}
                      {badge > 0 && <span className="admin-nav-badge">{badge > 99 ? "99+" : badge}</span>}
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
            <QuickSearchButton compact />
            <MobileMenu>
              {sections.flatMap((s) => s.items).map((item) => (
                <NavLink key={item.href} href={item.href} matchPrefixes={item.matchPrefixes} matchQuery={item.matchQuery}>
                  {item.title}
                  {(badges[item.href] ?? 0) > 0 && (
                    <span className="admin-nav-badge">{badges[item.href]}</span>
                  )}
                </NavLink>
              ))}
              <Link href="/" prefetch={false} className="nav-link">
                ← На сайт
              </Link>
            </MobileMenu>
          </nav>
        </div>

        <main className="admin-content flex-fill">{children}</main>
        <QuickSearch />
        <ScrollTopButton />
      </div>
    </div>
  );
}
