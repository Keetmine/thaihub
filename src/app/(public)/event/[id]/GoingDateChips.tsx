"use client";

import { useState, useTransition } from "react";
import { toggleGoing } from "@/app/(public)/favorites/actions";
import { formatShortDate } from "@/lib/dates";

/** Переключатели «иду» по датам события: у многодневного концерта можно
 *  выбрать только свои дни — в списки/календарь/план поездки попадают
 *  именно они. */
export default function GoingDateChips({
  occurrences,
  goingIds,
}: {
  occurrences: { id: string; startsAt: Date }[];
  goingIds: string[];
}) {
  const [going, setGoing] = useState(() => new Set(goingIds));
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    // Оптимистично: чип переключается сразу, при ошибке откатываем.
    const flip = () =>
      setGoing((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    flip();
    startTransition(async () => {
      try {
        await toggleGoing(id);
      } catch {
        flip();
      }
    });
  }

  return (
    <p className="mb-0 d-flex flex-wrap align-items-center gap-2">
      <span className="text-secondary">Пойду:</span>
      {occurrences.map((occ) => {
        const active = going.has(occ.id);
        return (
          <button
            key={occ.id}
            type="button"
            disabled={isPending}
            onClick={() => toggle(occ.id)}
            className={`event-chip border-0 ${active ? "event-chip-going" : ""}`}
            aria-pressed={active}
          >
            {active ? "✓ " : "+ "}
            {formatShortDate(occ.startsAt)}
          </button>
        );
      })}
    </p>
  );
}
