"use client";

import Link from "@/components/AppLink";
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BellIcon } from "@/components/icons";
import { useLocale, useT } from "@/components/LocaleProvider";
import { formatShortDate, formatTime } from "@/lib/dates";
import { markAllNotificationsRead } from "@/app/(public)/notifications/actions";
import type { RecentNotification } from "@/app/api/notifications/recent/route";

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

/**
 * Колокольчик в шапке со счётчиком непрочитанного. По клику — выпадающий
 * блок с последними уведомлениями, кнопкой «Прочитать все» и ссылкой на
 * полную ленту (правка владельца 2026-09-17: раньше колокольчик просто
 * вёл на /notifications, и ради одной строки приходилось уходить со
 * страницы). Список приезжает с /api/notifications/recent при каждом
 * открытии — блок открывают редко, а свежесть важнее кэша. Число берёт
 * из общего контекста: оно приходит с сервера при рендере, а дальше
 * обновляется само (Ж8).
 *
 * Клик по строке — та же логика, что в ленте: непрочитанная идёт через
 * /notifications/go/[id] (пометка без JS), прочитанная — прямо по href.
 */
export default function NotificationBell() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const unread = useUnreadCount();
  const n = t.account.notifications;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecentNotification[] | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Ушли на другую страницу — блок закрывается.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/notifications/recent?locale=${locale}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ items: RecentNotification[] }>) : null))
      .then((data) => {
        if (!cancelled) setItems(data?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    // Клик мимо блока и Escape закрывают его.
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, locale]);

  const markAll = () =>
    startTransition(async () => {
      await markAllNotificationsRead();
      // Строки в блоке гасим сразу, счётчик будим событием (его слушает
      // провайдер), серверные части — refresh.
      setItems((cur) => cur?.map((i) => ({ ...i, read: true })) ?? null);
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
      router.refresh();
    });

  return (
    <div ref={rootRef} className="notif-root">
      <button
        type="button"
        className={`icon-btn position-relative${open ? " is-active" : ""}`}
        aria-label={unread > 0 ? t.common.notificationsUnread(unread) : t.nav.notifications}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-tooltip={open ? undefined : t.nav.notifications}
        onClick={() => {
          // Список сбрасываем при открытии здесь, а не в эффекте: он
          // перечитывается каждый раз, и до ответа показывается «…».
          setItems(null);
          setOpen((cur) => !cur);
        }}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="notification-dot">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-popover" role="dialog" aria-label={n.title}>
          <div className="notif-popover-head">
            <span className="notif-popover-title">{n.title}</span>
            {unread > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm notif-popover-mark"
                disabled={pending}
                onClick={markAll}
              >
                {n.markAllReadShort}
              </button>
            )}
          </div>
          <div className="notif-popover-list">
            {items === null ? (
              <div className="notif-popover-empty">…</div>
            ) : items.length === 0 ? (
              <div className="notif-popover-empty">{n.emptyTitle}</div>
            ) : (
              items.map((item) => {
                const inner = (
                  <>
                    <span className="notif-row-icon" aria-hidden>
                      {item.icon}
                    </span>
                    <span className="notif-row-body">
                      <span className="notif-row-title">{item.title}</span>
                      {item.body && <span className="notif-row-text">{item.body}</span>}
                      <span className="notif-row-date">
                        {formatShortDate(new Date(item.createdAt), locale)}, {formatTime(new Date(item.createdAt))}
                      </span>
                    </span>
                  </>
                );
                const cls = `notif-row${item.read ? "" : " is-unread"}`;
                // Непрочитанная — через go-маршрут (пометит и передаст
                // дальше, даже без href), прочитанная — прямо по цели.
                const rowHref = item.read ? item.href : `/notifications/go/${item.id}`;
                return rowHref ? (
                  <Link key={item.id} href={rowHref} prefetch={false} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <div key={item.id} className={cls}>
                    {inner}
                  </div>
                );
              })
            )}
          </div>
          <div className="notif-popover-foot">
            <Link href="/notifications" prefetch={false} className="btn btn-ghost btn-sm w-100">
              {n.allNotifications}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
