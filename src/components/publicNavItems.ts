// Единый список пунктов главной публичной навигации: раньше он был
// задублирован в layout.tsx (десктопный ряд и мобильное меню отдельно)
// и при правках разъезжался.
import type { Dict } from "@/lib/i18n";

export type PublicNavItem = {
  href: string;
  /** Ключ подписи в словаре: сам текст живёт там, здесь только маршрут
   *  и подсветка. Ключом, а не строкой, — чтобы новый пункт нельзя было
   *  завести без перевода. */
  labelKey: keyof Dict["nav"];
  /** Активная подсветка и на вложенных путях (см. NavLink). */
  matchPrefixes?: string[];
  /** Шаг продуктового тура — рендерится обёрткой span[data-tour]. */
  tourId?: string;
  /** Показывать только залогиненным. */
  requiresUser?: boolean;
};

export const PUBLIC_NAV_ITEMS: PublicNavItem[] = [
  { href: "/events", labelKey: "events", matchPrefixes: ["/event/"] },
  {
    href: "/artists",
    labelKey: "artists",
    matchPrefixes: ["/artists/", "/agencies"],
    tourId: "artists",
  },
  { href: "/dramas", labelKey: "series", matchPrefixes: ["/dramas/"] },
  { href: "/novels", labelKey: "novels", matchPrefixes: ["/novels/"] },
  { href: "/locations", labelKey: "locations", matchPrefixes: ["/locations/"], tourId: "locations" },
  { href: "/trips", labelKey: "trips", matchPrefixes: ["/trips/"], tourId: "trips", requiresUser: true },
];
