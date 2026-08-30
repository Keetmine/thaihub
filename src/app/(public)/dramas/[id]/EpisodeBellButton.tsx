"use client";

import { useState, useTransition } from "react";
import { BellIcon, BellOffIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";
import { toggleEpisodeNotifications } from "@/app/(public)/favorites/actions";

/**
 * Колокольчик «уведомлять о новых сериях» рядом с кнопкой статуса на
 * странице сериала (З1, просьба владельца): подсвечен — уведомления
 * включены, клик переключает. «Смотрю сейчас» включает его сам (см.
 * favorites/actions.ts); без статуса клик заводит «Смотрю сейчас».
 * Оптимистичный, как остальные круглые кнопки: откат при ошибке.
 */
export default function EpisodeBellButton({
  dramaId,
  enabled: initialEnabled,
}: {
  dramaId: string;
  enabled: boolean;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [, startTransition] = useTransition();

  const label = enabled ? t.catalog.episodeBellOn : t.catalog.episodeBellOff;

  return (
    <button
      type="button"
      className={`round-icon-btn ${enabled ? "is-accent" : ""}`}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        startTransition(async () => {
          try {
            const result = await toggleEpisodeNotifications(dramaId);
            setEnabled(result.enabled);
          } catch {
            setEnabled(!next);
          }
        });
      }}
    >
      {enabled ? <BellIcon /> : <BellOffIcon />}
    </button>
  );
}
