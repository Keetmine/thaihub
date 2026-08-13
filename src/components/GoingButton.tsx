"use client";

import { useTransition } from "react";
import { toggleGoing } from "@/app/(public)/favorites/actions";

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
      className={isGoing ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
      disabled={isPending}
      aria-pressed={isGoing}
      onClick={() => {
        startTransition(async () => {
          await toggleGoing(eventId);
        });
      }}
    >
      {isGoing ? "Я пойду ✓" : "✅ Я пойду"}
    </button>
  );
}
