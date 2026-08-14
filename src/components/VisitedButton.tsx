"use client";

import { useTransition } from "react";
import { toggleLocationVisit } from "@/app/(public)/locations/actions";
import { CheckIcon, PlusIcon } from "@/components/icons";

export default function VisitedButton({
  locationId,
  isVisited,
  className,
}: {
  locationId: string;
  isVisited: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await toggleLocationVisit(locationId);
    });
  }

  const label = isVisited ? "Убрать из посещённых" : "Отметить как посещённое";

  return (
    <button
      type="button"
      className={`round-icon-btn ${isVisited ? "is-going" : ""} ${className ?? ""}`}
      disabled={isPending}
      aria-pressed={isVisited}
      aria-label={label}
      data-tooltip={label}
      onClick={handleClick}
    >
      {isVisited ? <CheckIcon /> : <PlusIcon />}
    </button>
  );
}
