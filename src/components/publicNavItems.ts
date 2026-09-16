// Единый список пунктов главной публичной навигации: раньше он был
// задублирован в layout.tsx (десктопный ряд и мобильное меню отдельно)
// и при правках разъезжался.
import type { ReactNode } from "react";
import type { Dict } from "@/lib/i18n";
import {
  PinIcon,
  PlaneIcon,
  TicketIcon,
  TvIcon,
  UsersIcon,
} from "@/components/icons";

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
  /** Иконка пункта — рисуется только в мобильной шторке: десктопному
   *  ряду из шести ссылок иконки не влезают, а в шторке без них плоский
   *  список читался стеной текста (фидбек владельца). */
  icon: (props: { className?: string }) => ReactNode;
};

export const PUBLIC_NAV_ITEMS: PublicNavItem[] = [
  { href: "/events", labelKey: "events", matchPrefixes: ["/event/"], icon: TicketIcon },
  {
    href: "/artists",
    labelKey: "artists",
    matchPrefixes: ["/artists/", "/agencies"],
    tourId: "artists",
    icon: UsersIcon,
  },
  // Один «Каталог» вместо «Сериалов» и «Новелл» (решение владельца
  // 2026-09-16). Новеллы вели в раздел из пяти записей — вывеска над
  // пустой комнатой; фильмы и шоу лежали в той же таблице, что
  // сериалы, и отдельного входа не имели вовсе. Теперь всё это разделы
  // одной страницы (см. CatalogKindChips), а меню похудело до шести
  // пунктов — семь в десктопный ряд и не влезали.
  //
  // Адрес прежний: /dramas. Переезжать URL нельзя, пока не отыгран
  // августовский обвал трафика (docs/features/seo.md). Поэтому у пункта
  // в префиксах и /novels — чтобы «Каталог» подсвечивался и на
  // странице новеллы.
  {
    href: "/dramas",
    labelKey: "catalogue",
    matchPrefixes: ["/dramas/", "/novels", "/novels/"],
    tourId: "series",
    icon: TvIcon,
  },
  {
    href: "/locations",
    labelKey: "locations",
    matchPrefixes: ["/locations/"],
    tourId: "locations",
    icon: PinIcon,
  },
  // Сообщества видны и гостю: витрина открыта всем и работает на поиск
  // (см. docs/features/communities.md).
  {
    href: "/communities",
    labelKey: "communities",
    matchPrefixes: ["/communities/"],
    icon: UsersIcon,
  },
  {
    href: "/trips",
    labelKey: "trips",
    matchPrefixes: ["/trips/"],
    tourId: "trips",
    requiresUser: true,
    icon: PlaneIcon,
  },
];

/**
 * Вложенные пути, на которых пункт остаётся подсвеченным.
 *
 * Шапка берёт их из `PUBLIC_NAV_ITEMS`, футеру нужны те же — плюс свои,
 * которых в шапке нет вовсе (вики, помощь, документы). Держим одним
 * списком: разъедутся — и на карточке сериала подсветится «Сериалы» в
 * шапке, но не в футере, что и случилось.
 */
export const NAV_PREFIXES: Record<string, string[]> = {
  ...Object.fromEntries(
    PUBLIC_NAV_ITEMS.filter((i) => i.matchPrefixes).map((i) => [i.href, i.matchPrefixes!]),
  ),
  // Футер перечисляет «Сериалы» и «Новеллы» ОТДЕЛЬНЫМИ ссылками (ему
  // это можно: он же карта сайта, и перелинковка для краулера тут
  // полезна), поэтому у них свои префиксы — те, что были до слияния
  // пунктов меню. Без этой пары шапочный список префиксов «Каталога»
  // протёк бы в футер, и на странице новеллы подсветились бы СРАЗУ ДВЕ
  // ссылки (ровно это ловит tests/e2e/nav-active.spec.ts).
  "/dramas": ["/dramas/"],
  "/novels": ["/novels/"],
  "/wiki": ["/wiki/"],
  "/lists": ["/lists/"],
  "/artist-lists": ["/artist-lists/"],
  "/account": ["/account/"],
};
