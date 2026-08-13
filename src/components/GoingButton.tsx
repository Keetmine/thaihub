"use client";

import { useTransition } from "react";
import { toggleGoing } from "@/app/(public)/favorites/actions";
import { CheckIcon } from "@/components/icons";

export default function GoingButton({
  eventId,
  isGoing,
}: {
  eventId: string;
  isGoing: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={`going-btn ${isGoing ? "is-going" : ""}`}
      disabled={isPending}
      aria-pressed={isGoing}
      onClick={() => {
        startTransition(async () => {
          await toggleGoing(eventId);
        });
      }}
    >
      <CheckIcon />
      Я пойду
    </button>
  );
}
