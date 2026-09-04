"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/components/NotificationBell";
import { markAllNotificationsRead } from "./actions";

/**
 * «Отметить все прочитанными» — клиентская кнопка, а не форма: после
 * server action серверный layout (а с ним и число у колокольчика) не
 * перерендеривается, и бейдж висел бы до минутного тика поллинга.
 * Поэтому после экшена будим руками и ленту (router.refresh), и
 * колокольчик (window-событие, его слушает NotificationBellProvider).
 */
export default function MarkAllReadButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsRead();
          router.refresh();
          window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
        })
      }
    >
      {label}
    </button>
  );
}
