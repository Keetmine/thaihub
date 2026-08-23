"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function NavLink({
  href,
  matchPrefixes,
  matchQuery,
  children,
}: {
  href: string;
  matchPrefixes?: string[];
  /** Активность с учётом query (?view=bands): значение — что должно
   *  стоять в параметре, null — параметр должен ОТСУТСТВОВАТЬ (чтобы
   *  «Исполнители» не подсвечивались на ?view=bands). */
  matchQuery?: Record<string, string | null>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
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
    <Link href={href} prefetch={false} className={`nav-link ${isActive ? "active" : ""}`}>
      {children}
    </Link>
  );
}
