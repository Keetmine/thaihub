// Единый список пунктов главной публичной навигации: раньше он был
// задублирован в layout.tsx (десктопный ряд и мобильное меню отдельно)
// и при правках разъезжался.
export type PublicNavItem = {
  href: string;
  label: string;
  /** Активная подсветка и на вложенных путях (см. NavLink). */
  matchPrefixes?: string[];
  /** Шаг продуктового тура — рендерится обёрткой span[data-tour]. */
  tourId?: string;
  /** Показывать только залогиненным. */
  requiresUser?: boolean;
};

export const PUBLIC_NAV_ITEMS: PublicNavItem[] = [
  { href: "/events", label: "Афиша", matchPrefixes: ["/event/"] },
  {
    href: "/artists",
    label: "Артисты",
    matchPrefixes: ["/artists/", "/agencies"],
    tourId: "artists",
  },
  { href: "/dramas", label: "Дорамы", matchPrefixes: ["/dramas/"] },
  { href: "/novels", label: "Новеллы", matchPrefixes: ["/novels/"] },
  { href: "/locations", label: "Локации", matchPrefixes: ["/locations/"], tourId: "locations" },
  { href: "/trips", label: "Поездки", matchPrefixes: ["/trips/"], tourId: "trips", requiresUser: true },
];
