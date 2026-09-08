"use client";

import { useState, useTransition } from "react";
import { toggleWantToVisit } from "@/app/(public)/lists/actions";
import { HeartIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

/** «Хочу сюда» на странице локации — та же манера, что VisitedButton
 *  рядом: круглая кнопка, оптимистичное состояние, откат при ошибке.
 *  Кладёт место в системный список «Хочу посетить» (см.
 *  src/lib/systemLists.ts), повторный клик убирает. */
export default function WantToVisitButton({
  locationId,
  isWanted,
  className,
}: {
  locationId: string;
  isWanted: boolean;
  className?: string;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();

  // Оптимистично, как FavoriteButton/VisitedButton.
  const [active, setActive] = useState(isWanted);
  const [prevProp, setPrevProp] = useState(isWanted);
  if (isWanted !== prevProp) {
    setPrevProp(isWanted);
    setActive(isWanted);
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !active;
    setActive(next);
    startTransition(async () => {
      try {
        // Экшен отвечает ошибкой значением (см. lists/actions.ts) — для
        // отката это то же самое, что брошенное исключение.
        const res = await toggleWantToVisit(locationId);
        if (res && !res.ok) setActive(!next);
      } catch {
        setActive(!next);
      }
    });
  }

  const label = active ? t.widgets.wantToVisit.unmark : t.widgets.wantToVisit.mark;

  return (
    <button
      type="button"
      className={`round-icon-btn ${active ? "is-going" : ""} ${className ?? ""}`}
      disabled={isPending}
      aria-pressed={active}
      aria-label={label}
      data-tooltip={label}
      onClick={handleClick}
    >
      <HeartIcon filled={active} />
    </button>
  );
}
