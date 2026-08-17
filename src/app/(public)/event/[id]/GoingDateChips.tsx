"use client";

import { useState, useTransition } from "react";
import { toggleGoing } from "@/app/(public)/favorites/actions";
import { formatShortDate } from "@/lib/dates";
import { CheckIcon, PlusIcon } from "@/components/icons";

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

  const now = new Date();
  const allPast = occurrences.every((occ) => occ.startsAt < now);

  return (
    <div className="mb-0">
      <p className="small text-secondary mb-1">
        {allPast
          ? "Были на этом событии? Отметьте даты — они попадут в вашу статистику:"
          : "Пойдёте? Отметьте свои даты — они попадут в календарь и план поездки:"}
      </p>
      <p className="mb-0 d-flex flex-wrap align-items-center gap-2">
        {occurrences.map((occ) => {
          const active = going.has(occ.id);
          const isPast = occ.startsAt < now;
          return (
            <button
              key={occ.id}
              type="button"
              disabled={isPending}
              onClick={() => toggle(occ.id)}
              className={`btn btn-sm d-inline-flex align-items-center gap-1 ${
                active ? "btn-primary" : "btn-ghost"
              }`}
              aria-pressed={active}
              title={
                active
                  ? isPast
                    ? "Убрать отметку о посещении"
                    : "Убрать из моего плана"
                  : isPast
                    ? "Отметить, что были в этот день"
                    : "Пойду в этот день"
              }
            >
              {active ? <CheckIcon /> : <PlusIcon />}
              {formatShortDate(occ.startsAt)}
            </button>
          );
        })}
      </p>
    </div>
  );
}
