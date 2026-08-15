"use client";

import { useState, useTransition } from "react";
import { toggleGoing } from "@/app/(public)/favorites/actions";
import { CheckIcon, PlusIcon } from "@/components/icons";

export default function GoingButton({
  occurrenceId,
  isGoing,
  isPast = false,
  variant = "pill",
  className,
}: {
  /** «Иду» ставится на конкретную дату события. */
  occurrenceId: string;
  isGoing: boolean;
  /** true — дата уже прошла: подписи меняются на «Я ходил(а)» (отметка
   *  посещения задним числом), не «Я пойду». */
  isPast?: boolean;
  /** "pill" — inline labeled button (event detail page, existing look).
   *  "icon" — icon-only toggle (plus → check) meant to sit inline alongside
   *  other compact icon actions, with a hover tooltip explaining it. */
  variant?: "pill" | "icon";
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  // Оптимистично: галочка меняется сразу по клику (см. FavoriteButton —
  // в клиентской бесконечной ленте серверная ревалидация карточку не
  // перерисует), проп с сервера пересинхронизирует при навигации.
  const [active, setActive] = useState(isGoing);
  const [prevProp, setPrevProp] = useState(isGoing);
  if (isGoing !== prevProp) {
    setPrevProp(isGoing);
    setActive(isGoing);
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !active;
    setActive(next);
    startTransition(async () => {
      try {
        await toggleGoing(occurrenceId);
      } catch {
        setActive(!next);
      }
    });
  }

  if (variant === "icon") {
    const label = isPast
      ? active
        ? "Убрать отметку «я ходил(а)»"
        : "Я ходил(а)"
      : active
        ? "Я не пойду"
        : "Я пойду";
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
        {active ? <CheckIcon /> : <PlusIcon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`going-btn ${active ? "is-going" : ""}`}
      disabled={isPending}
      aria-pressed={active}
      onClick={handleClick}
    >
      <CheckIcon />
      {isPast ? "Я ходил(а)" : "Я пойду"}
    </button>
  );
}
