"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Считает глубину внутренней навигации за вкладку (sessionStorage) —
 *  BackLink по ней понимает, есть ли куда «назад» внутри сайта. */
export default function NavDepthTracker() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const depth = Number(sessionStorage.getItem("nav-depth") ?? "0");
      sessionStorage.setItem("nav-depth", String(depth + 1));
    } catch {
      // приватный режим и т.п. — просто не считаем
    }
  }, [pathname]);

  return null;
}
