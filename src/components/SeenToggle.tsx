"use client";

import { useState, useTransition } from "react";
import { EyeIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

/**
 * Глазик у ОДНОГО артиста на странице события: «видели здесь / не
 * видели». Стоит на карточке в составе и в лайнапе дня — прямо там, где
 * человек смотрит на список (правка владельца 2026-09-15: «заходить к
 * каждому и снимать — неудобно»). Показывается только тому, у кого на
 * событии стоит «иду» на прошедшую дату: до события отмечать нечего.
 *
 * Оптимистично: отметка личная, конфликтовать не с чем; ответ сервера
 * подтверждает или поправляет.
 */
export default function SeenToggle({
  eventId,
  performerId,
  initialSeen,
  toggle,
  size = "sm",
  className = "",
}: {
  eventId: string;
  performerId: string;
  initialSeen: boolean;
  toggle: (eventId: string, performerId: string) => Promise<{ seen: boolean }>;
  /** "sm" — поверх фото в каст-сетке; "chip" — рядом с капсулой. */
  size?: "sm" | "chip";
  className?: string;
}) {
  const t = useT();
  const [seen, setSeen] = useState(initialSeen);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={`seen-toggle seen-toggle-${size} ${seen ? "is-active" : ""} ${className}`}
      aria-label={seen ? t.widgets.seenLive.unmarkHere : t.widgets.seenLive.markHere}
      title={seen ? t.widgets.seenLive.unmarkHere : t.widgets.seenLive.markHere}
      aria-pressed={seen}
      disabled={isPending}
      onClick={(e) => {
        // Глазик лежит на ссылке-карточке: клик по нему — отметка, а не
        // переход на страницу артиста.
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          setSeen((prev) => !prev);
          const result = await toggle(eventId, performerId).catch(() => null);
          if (result) setSeen(result.seen);
        });
      }}
    >
      <EyeIcon filled={seen} />
    </button>
  );
}
