"use client";

import { useTransition } from "react";
import { toggleGoing } from "@/app/(public)/favorites/actions";
import { CheckIcon, PlusIcon } from "@/components/icons";

export default function GoingButton({
  eventId,
  isGoing,
  variant = "pill",
  className,
}: {
  eventId: string;
  isGoing: boolean;
  /** "pill" — inline labeled button (event detail page, existing look).
   *  "icon" — icon-only toggle (plus → check) meant to sit inline alongside
   *  other compact icon actions, with a hover tooltip explaining it. */
  variant?: "pill" | "icon";
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await toggleGoing(eventId);
    });
  }

  if (variant === "icon") {
    const label = isGoing ? "Я не пойду" : "Я пойду";
    return (
      <button
        type="button"
        className={`round-icon-btn ${isGoing ? "is-going" : ""} ${className ?? ""}`}
        disabled={isPending}
        aria-pressed={isGoing}
        aria-label={label}
        data-tooltip={label}
        onClick={handleClick}
      >
        {isGoing ? <CheckIcon /> : <PlusIcon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`going-btn ${isGoing ? "is-going" : ""}`}
      disabled={isPending}
      aria-pressed={isGoing}
      onClick={handleClick}
    >
      <CheckIcon />
      Я пойду
    </button>
  );
}
