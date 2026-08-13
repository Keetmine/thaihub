"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({
  href,
  matchPrefixes,
  children,
}: {
  href: string;
  matchPrefixes?: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (matchPrefixes ?? []).some((p) => pathname.startsWith(p));

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
