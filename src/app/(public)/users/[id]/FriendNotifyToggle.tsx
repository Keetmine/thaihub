"use client";

import { useState, useTransition } from "react";
import { BellIcon, BellOffIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";
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
  const t = useT();
  const [isMuted, setIsMuted] = useState(muted);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={`chip-link chip-toggle${isMuted ? " is-muted" : ""}`}
      disabled={isPending}
      title={isMuted ? t.social.profile.notifyOffTitle : t.social.profile.notifyOnTitle}
      onClick={() =>
        startTransition(async () => {
          await toggleFriendNotifications(friendId);
          setIsMuted(!isMuted);
        })
      }
    >
      {isMuted ? <BellOffIcon /> : <BellIcon />}
      {isMuted ? t.social.profile.notifyOff : t.social.profile.notifyOn}
    </button>
  );
}
