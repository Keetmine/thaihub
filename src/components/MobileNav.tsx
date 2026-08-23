"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  CalendarIcon,
  CloseIcon,
  HomeIcon,
  MenuIcon,
  SearchIcon,
  TicketIcon,
} from "@/components/icons";

/**
 * Мобильная навигация публичной части (Э2.6): бургер в шапке и пункт
 * «Меню» в нижнем таб-баре открывают одну и ту же шторку-drawer, поэтому
 * состояние живёт в общем контексте, а не внутри одного компонента.
 * Админка использует свой прежний MobileMenu (выпадашка под навбаром).
 */
const MobileNavContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("MobileNav components must be wrapped in <MobileNavProvider>");
  return ctx;
}

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Закрытие при навигации. Правка состояния прямо в рендере (а не в
  // эффекте) экономит лишний пострендер — см.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Пока шторка открыта: Esc закрывает, скролл боди заблокирован.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>
  );
}

/** Бургер в мобильной шапке. */
export function MobileMenuButton() {
  const { open, setOpen } = useMobileNav();
  return (
    <button
      type="button"
      className="burger-btn"
      aria-label={open ? "Закрыть меню" : "Открыть меню"}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <span className={open ? "burger-line-1" : ""} />
      <span className={open ? "burger-line-2" : ""} />
      <span className={open ? "burger-line-3" : ""} />
    </button>
  );
}

/**
 * Шторка на всю высоту справа. Рендерится в layout вне .pill-nav:
 * backdrop-filter навбара сделал бы его containing block'ом для
 * position: fixed, и панель позиционировалась бы относительно навбара.
 */
export function MobileDrawer({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useMobileNav();
  if (!open) return null;
  return (
    // d-sm-none и на обёртке: fixed-потомки display:none-родителя не
    // рисуются, так что при растягивании окна шторка исчезает сама.
    <div className="d-sm-none">
      <div className="mobile-drawer-backdrop" onClick={() => setOpen(false)} />
      <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Меню">
        <div className="mobile-drawer-head">
          <span className="mobile-drawer-title font-display">Меню</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Состав таб-бара: «Меню» вместо «Профиля» — профиль (и «Войти» для
// гостя) уже лежит в шторке, а отдельный таб «Профиль» гостю бесполезен.
const TABS: {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  matchPrefixes?: string[];
  exact?: boolean;
}[] = [
  { href: "/", label: "Главная", icon: HomeIcon, exact: true },
  { href: "/events", label: "Афиша", icon: TicketIcon, matchPrefixes: ["/event/"] },
  { href: "/calendar", label: "Календарь", icon: CalendarIcon, matchPrefixes: ["/day/"] },
  { href: "/search", label: "Поиск", icon: SearchIcon },
];

/** Нижний таб-бар — только на мобильных (d-sm-none). */
export function MobileTabBar() {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();
  return (
    <nav className="mobile-tabbar d-sm-none" aria-label="Быстрая навигация">
      {TABS.map(({ href, label, icon: Icon, matchPrefixes, exact }) => {
        // Пока открыта шторка, подсвечен таб «Меню», а не текущая страница.
        const active =
          !open &&
          (pathname === href ||
            (!exact &&
              (pathname.startsWith(`${href}/`) ||
                (matchPrefixes ?? []).some((p) => pathname.startsWith(p)))));
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className={`mobile-tab ${active ? "active" : ""}`}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className={`mobile-tab ${open ? "active" : ""}`}
        aria-expanded={open}
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        onClick={() => setOpen(!open)}
      >
        <MenuIcon />
        <span>Меню</span>
      </button>
    </nav>
  );
}
