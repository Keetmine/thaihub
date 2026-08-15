"use client";

import { useState, useTransition } from "react";
import { toggleFriendNotifications } from "./actions";

/** Кнопка-колокольчик на профиле друга: получать ли в Telegram
 *  уведомления «идёт на событие» об этом человеке. */
export default function FriendNotifyToggle({
  friendId,
  muted,
}: {
  friendId: string;
  muted: boolean;
}) {
  const [isMuted, setIsMuted] = useState(muted);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={isPending}
      title={isMuted ? "Уведомления об этом друге выключены" : "Уведомления об этом друге включены"}
      onClick={() =>
        startTransition(async () => {
          await toggleFriendNotifications(friendId);
          setIsMuted(!isMuted);
        })
      }
    >
      {isMuted ? "🔕 Уведомления выкл." : "🔔 Уведомления вкл."}
    </button>
  );
}
