"use client";

import Link from "@/components/AppLink";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/components/LocaleProvider";
import type { Dict } from "@/lib/i18n/en";
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
  const t = useT();
  return (
    <button
      type="button"
      className="burger-btn"
      aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
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
  const t = useT();
  if (!open) return null;
  return (
    // d-lg-none и на обёртке: fixed-потомки display:none-родителя не
    // рисуются, так что при растягивании окна шторка исчезает сама.
    <div className="d-lg-none">
      <div className="mobile-drawer-backdrop" onClick={() => setOpen(false)} />
      <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label={t.nav.menu}>
        <div className="mobile-drawer-head">
          <span className="mobile-drawer-title font-display">{t.nav.menu}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label={t.nav.closeMenu}
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
  /** Подпись берётся из словаря по ключу — язык решается при рендере. */
  labelKey: keyof Dict["nav"];
  icon: (props: { className?: string }) => React.ReactNode;
  matchPrefixes?: string[];
  exact?: boolean;
}[] = [
  { href: "/", labelKey: "home", icon: HomeIcon, exact: true },
  { href: "/events", labelKey: "events", icon: TicketIcon, matchPrefixes: ["/event/"] },
  // «Даты», а не «Календарь»: длинная подпись на 360px обрезалась в
  // «Календа…» (пять табов дают ячейке ~55px, слово занимает ~54).
  { href: "/calendar", labelKey: "calendarShort", icon: CalendarIcon, matchPrefixes: ["/day/"] },
  { href: "/search", labelKey: "search", icon: SearchIcon },
];

/** Нижний таб-бар — на телефонах и планшетах (d-lg-none). */
export function MobileTabBar() {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="mobile-tabbar d-lg-none" aria-label={t.nav.quickNav}>
      {TABS.map(({ href, labelKey, icon: Icon, matchPrefixes, exact }) => {
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
            <span>{t.nav[labelKey]}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className={`mobile-tab ${open ? "active" : ""}`}
        aria-expanded={open}
        aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
        onClick={() => setOpen(!open)}
      >
        <MenuIcon />
        <span>{t.nav.menu}</span>
      </button>
    </nav>
  );
}
