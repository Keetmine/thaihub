"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BellIcon } from "@/components/icons";

// Раз в столько миллисекунд перепрашиваем счётчик. Минуты достаточно:
// уведомления не чат, а частый опрос — лишняя нагрузка с каждой
// открытой вкладки.
const POLL_MS = 60_000;

/** Колокольчик в шапке со счётчиком непрочитанного. Ведёт на ленту
 *  активностей — приглашения в поездки, заявки в друзья, ответы.
 *  Число приходит с сервера при рендере, а дальше обновляется само:
 *  опрос /api/notifications/unread по таймеру, при возврате на
 *  вкладку и при смене маршрута — иначе о новом уведомлении было не
 *  узнать без перезагрузки страницы (Ж8). */
export default function NotificationBell({ unread: initial }: { unread: number }) {
  const [unread, setUnread] = useState(initial);
  const pathname = usePathname();

  // Серверное число обновилось (например, после router.refresh) —
  // доверяем ему как более свежему.
  useEffect(() => setUnread(initial), [initial]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/notifications/unread", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: number };
        if (!cancelled && typeof data.unread === "number") setUnread(data.unread);
      } catch {
        // Сеть моргнула — просто подождём следующего тика.
      }
    };

    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Перешли на другую страницу — счётчик мог устареть (например,
  // прочитали ленту на /notifications). Обновляем без ожидания тика.
  useEffect(() => {
    fetch("/api/notifications/unread", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { unread?: number } | null) => {
        if (data && typeof data.unread === "number") setUnread(data.unread);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      prefetch={false}
      className="icon-btn position-relative"
      aria-label={unread > 0 ? `Уведомления: ${unread} новых` : "Уведомления"}
    >
      <BellIcon />
      {unread > 0 && (
        <span className="notification-dot">{unread > 9 ? "9+" : unread}</span>
      )}
    </Link>
  );
}
