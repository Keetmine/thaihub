"use client";

import { useEffect } from "react";

/** Регистрирует оффлайн service worker (public/sw.js) — один раз на
 *  клиенте, только в production-сборке (в dev мешает hot reload). */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
