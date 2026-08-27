"use client";

import Link from "@/components/AppLink";
import { usePathname, useSearchParams } from "next/navigation";
import { stripLocale } from "@/lib/i18n/config";

export default function NavLink({
  href,
  matchPrefixes,
  matchQuery,
  className = "nav-link",
  children,
}: {
  href: string;
  matchPrefixes?: string[];
  /** Активность с учётом query (?view=bands): значение — что должно
   *  стоять в параметре, null — параметр должен ОТСУТСТВОВАТЬ (чтобы
   *  «Исполнители» не подсвечивались на ?view=bands). */
  matchQuery?: Record<string, string | null>;
  /** Свой набор классов — футеру нужен .footer-link, а не .nav-link.
   *  Класс .active добавляется к любому: подсветка активного раздела
   *  живёт в одном месте, а не в двух компонентах. */
  className?: string;
  children: React.ReactNode;
}) {
  // Русские страницы живут под /ru (рерайт в proxy), а href сюда
  // приходит без префикса — его подставляет AppLink. Сравнивать надо
  // очищенный путь, иначе на русском не совпадает НИЧЕГО: «/ru/dramas»
  // против «/dramas». Подсветки на русской версии не было вовсе.
  const { path: pathname } = stripLocale(usePathname());
  const searchParams = useSearchParams();
  const hrefPath = href.split("?")[0];
  const queryOk = !matchQuery
    ? true
    : Object.entries(matchQuery).every(([k, v]) =>
        v === null ? !searchParams.has(k) : searchParams.get(k) === v,
      );
  const isActive =
    (pathname === hrefPath && queryOk) ||
    (matchPrefixes ?? []).some((p) => pathname.startsWith(p));

  return (
    // These routes are all force-dynamic (hit Postgres on every render), so
    // viewport-triggered prefetching would fire a real DB query for every
    // nav link on every page load — turning it off avoids piling up
    // background queries that can make an actual click feel like it hangs.
    <Link href={href} prefetch={false} className={`${className} ${isActive ? "active" : ""}`}>
      {children}
    </Link>
  );
}
