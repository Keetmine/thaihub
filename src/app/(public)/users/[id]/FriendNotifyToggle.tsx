"use client";

import { useState, useTransition } from "react";
import { BellIcon, BellOffIcon } from "@/components/icons";
import { toggleFriendNotifications } from "./actions";

/** Кнопка-колокольчик на профиле друга: получать ли в Telegram
 *  уведомления «идёт на событие» об этом человеке. Капсула в стиле
 *  .chip-link со stroke-иконкой (.chip-toggle в globals.css). */
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
      className={`chip-link chip-toggle${isMuted ? " is-muted" : ""}`}
      disabled={isPending}
      title={isMuted ? "Уведомления об этом друге выключены" : "Уведомления об этом друге включены"}
      onClick={() =>
        startTransition(async () => {
          await toggleFriendNotifications(friendId);
          setIsMuted(!isMuted);
        })
      }
    >
      {isMuted ? <BellOffIcon /> : <BellIcon />}
      {isMuted ? "Уведомления выкл." : "Уведомления вкл."}
    </button>
  );
}
