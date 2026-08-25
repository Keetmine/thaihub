"use client";

import { useState, useTransition } from "react";
import { toggleLocationVisit } from "@/app/(public)/locations/actions";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

export default function VisitedButton({
  locationId,
  isVisited,
  className,
}: {
  locationId: string;
  isVisited: boolean;
  className?: string;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();

  // Оптимистично, как FavoriteButton/GoingButton.
  const [active, setActive] = useState(isVisited);
  const [prevProp, setPrevProp] = useState(isVisited);
  if (isVisited !== prevProp) {
    setPrevProp(isVisited);
    setActive(isVisited);
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !active;
    setActive(next);
    startTransition(async () => {
      try {
        await toggleLocationVisit(locationId);
      } catch {
        setActive(!next);
      }
    });
  }

  const label = active ? t.widgets.visited.unmark : t.widgets.visited.mark;

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
