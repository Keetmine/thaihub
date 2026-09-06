"use client";

import { useState, useTransition } from "react";
import { EyeIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

/**
 * «Видела вживую» — глазик на странице исполнителя. Показывает ИТОГОВОЕ
 * состояние: и автоматику (артисты посещённых событий афиши и личных
 * событий поездок), и ручное решение поверх неё. Поэтому им можно и
 * отметить концерт до регистрации на сайте, и снять одного из состава
 * события — «на концерте пятеро, а разглядела двоих» (см.
 * docs/features/gamification.md).
 */
export default function SeenLiveButton({
  performerId,
  initialSeen,
  toggle,
}: {
  performerId: string;
  initialSeen: boolean;
  toggle: (performerId: string) => Promise<{ seen: boolean }>;
}) {
  const t = useT();
  const [seen, setSeen] = useState(initialSeen);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={`icon-btn ${seen ? "is-active" : ""}`}
      aria-label={seen ? t.widgets.seenLive.unmark : t.widgets.seenLive.mark}
      title={seen ? t.widgets.seenLive.short : t.widgets.seenLive.mark}
      aria-pressed={seen}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          // Оптимистично: отметка личная, конфликтовать не с чем.
          setSeen((prev) => !prev);
          const result = await toggle(performerId).catch(() => null);
          if (result) setSeen(result.seen);
        })
      }
    >
      <EyeIcon filled={seen} />
    </button>
  );
}
