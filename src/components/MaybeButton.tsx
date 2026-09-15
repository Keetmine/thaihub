"use client";

import { useState, useTransition } from "react";
import { toggleMaybe } from "@/app/(public)/favorites/actions";
import { HelpIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

/**
 * «Возможно пойду» — третье состояние между сердечком («интересно
 * вообще») и «иду» («решено»), на КОНКРЕТНУЮ дату.
 *
 * Зачем: в один вечер два концерта, оба интересны, пойду на один —
 * хочется видеть оба в расписании поездки, а не искать их среди всей
 * афиши (правка владельца 2026-09-15). В плане поездки кандидаты стоят
 * рядом с твёрдыми планами, только приглушённые.
 *
 * Ставится и снимается как «иду», оптимистично; сервер сам снимает
 * встречную отметку — состояния взаимоисключимы.
 */
export default function MaybeButton({
  occurrenceId,
  isMaybe,
  className,
}: {
  occurrenceId: string;
  isMaybe: boolean;
  className?: string;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState(isMaybe);
  // Тот же пересинхрон с сервером, что у GoingButton: в клиентской
  // бесконечной ленте ревалидация карточку не перерисует.
  const [prevProp, setPrevProp] = useState(isMaybe);
  if (isMaybe !== prevProp) {
    setPrevProp(isMaybe);
    setActive(isMaybe);
  }

  const label = active ? t.widgets.maybe.remove : t.widgets.maybe.add;

  return (
    <button
      type="button"
      className={`round-icon-btn ${active ? "is-maybe" : ""} ${className ?? ""}`}
      disabled={isPending}
      aria-pressed={active}
      aria-label={label}
      data-tooltip={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !active;
        setActive(next);
        startTransition(async () => {
          try {
            const result = await toggleMaybe(occurrenceId);
            if (!result.ok) setActive(!next);
          } catch {
            setActive(!next);
          }
        });
      }}
    >
      <HelpIcon />
    </button>
  );
}
