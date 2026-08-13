"use client";

import { useTransition } from "react";
import {
  toggleFavoriteDrama,
  toggleFavoriteEvent,
  toggleFavoritePerformer,
} from "@/app/(public)/favorites/actions";

export type FavoriteKind = "performer" | "drama" | "event";

const actionByKind: Record<FavoriteKind, (id: string) => Promise<void>> = {
  performer: toggleFavoritePerformer,
  drama: toggleFavoriteDrama,
  event: toggleFavoriteEvent,
};

export default function FavoriteButton({
  kind,
  id,
  isFavorited,
  className,
}: {
  kind: FavoriteKind;
  id: string;
  isFavorited: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={className ?? "btn btn-outline-secondary btn-sm"}
      disabled={isPending}
      aria-pressed={isFavorited}
      onClick={() => {
        startTransition(async () => {
          await actionByKind[kind](id);
        });
      }}
    >
      {isFavorited ? "★ В избранном" : "☆ В избранное"}
    </button>
  );
}
