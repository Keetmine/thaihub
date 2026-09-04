"use client";

import Link from "@/components/AppLink";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BellIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

// Раз в столько миллисекунд перепрашиваем счётчик. Минуты достаточно:
// уведомления не чат, а частый опрос — лишняя нагрузка с каждой
// открытой вкладки.
const POLL_MS = 60_000;

/** Имя window-события «число непрочитанных изменилось, перепроси». */
export const NOTIFICATIONS_CHANGED_EVENT = "myblhub:notifications-changed";

// Запрос один на всех: пока он в полёте, следующие вызовы ждут тот же
// промис. Иначе совпавшие поводы уходили бы на сервер по отдельности —
// тик таймера вместе с возвратом на вкладку, а в dev ещё и двойной
// прогон эффектов под StrictMode.
let inFlight: Promise<number | null> | null = null;

/** Свежий счётчик с сервера; null — не получилось (сеть моргнула,
 *  сессия истекла), тогда оставляем прежнее число до следующего тика. */
function fetchUnread(): Promise<number | null> {
  inFlight ??= fetch("/api/notifications/unread", { cache: "no-store" })
    .then((res) => (res.ok ? (res.json() as Promise<{ unread?: number }>) : null))
    .then((data) => (typeof data?.unread === "number" ? data.unread : null))
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// null — провайдера над колокольчиком нет (см. useUnreadCount).
const UnreadContext = createContext<number | null>(null);

function useUnreadCount() {
  const unread = useContext(UnreadContext);
  if (unread === null) {
    throw new Error("<NotificationBell> must be wrapped in <NotificationBellProvider>");
  }
  return unread;
}

/**
 * Счётчик непрочитанного — один на всю шапку. Колокольчиков в разметке
 * несколько (мобильный ряд и десктопный живут в DOM одновременно,
 * переключает их только CSS), и пока каждый опрашивал сервер сам,
 * на любую страницу уходило по запросу на экземпляр. Состояние и опрос
 * переехали в общий контекст — как у MobileNavProvider со шторкой.
 *
 * `unread === null` — гость: колокольчика нет, опрашивать нечего.
 */
export function NotificationBellProvider({
  unread: initial,
  children,
}: {
  unread: number | null;
  children: React.ReactNode;
}) {
  const [unread, setUnread] = useState(initial ?? 0);
  const [prevInitial, setPrevInitial] = useState(initial);
  const pathname = usePathname();
  const enabled = initial !== null;

  // Серверное число обновилось (например, после «отметить прочитанными»
  // с её revalidatePath) — доверяем ему как более свежему. Правим
  // состояние прямо в рендере, а не в эффекте: так React отбрасывает
  // текущий рендер и не делает лишний проход с устаревшим числом (тот
  // же приём — в MobileNavProvider).
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setUnread(initial ?? 0);
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const refresh = async () => {
      if (document.hidden) return;
      const value = await fetchUnread();
      if (!cancelled && value !== null) setUnread(value);
    };

    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    // «Отметить все прочитанными» шлёт это событие: pathname при этом
    // не меняется, а серверный layout после server action не
    // перерендеривается (проверено вживую) — без пинка бейдж висел бы
    // до минутного тика поллинга.
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    };
  }, [enabled]);

  // Перешли на другую страницу — счётчик мог устареть (например,
  // прочитали ленту на /notifications). Обновляем без ожидания тика.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchUnread().then((value) => {
      if (!cancelled && value !== null) setUnread(value);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, pathname]);

  return <UnreadContext.Provider value={unread}>{children}</UnreadContext.Provider>;
}

/** Колокольчик в шапке со счётчиком непрочитанного. Ведёт на ленту
 *  активностей — приглашения в поездки, заявки в друзья, ответы.
 *  Число берёт из общего контекста: оно приходит с сервера при рендере,
 *  а дальше обновляется само — иначе о новом уведомлении было не узнать
 *  без перезагрузки страницы (Ж8). */
export default function NotificationBell() {
  const t = useT();
  const unread = useUnreadCount();

  return (
    <Link
      href="/notifications"
      prefetch={false}
      className="icon-btn position-relative"
      aria-label={unread > 0 ? t.common.notificationsUnread(unread) : t.nav.notifications}
    >
      <BellIcon />
      {unread > 0 && (
        <span className="notification-dot">{unread > 9 ? "9+" : unread}</span>
      )}
    </Link>
  );
}
