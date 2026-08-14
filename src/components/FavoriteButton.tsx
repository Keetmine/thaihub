"use client";

import { useTransition } from "react";
import {
  toggleFavoriteAgency,
  toggleFavoriteDrama,
  toggleFavoriteEvent,
  toggleFavoritePerformer,
} from "@/app/(public)/favorites/actions";
import { HeartIcon } from "@/components/icons";

export type FavoriteKind = "performer" | "drama" | "event" | "agency";

const actionByKind: Record<FavoriteKind, (id: string) => Promise<void>> = {
  performer: toggleFavoritePerformer,
  drama: toggleFavoriteDrama,
  event: toggleFavoriteEvent,
  agency: toggleFavoriteAgency,
};

export default function FavoriteButton({
  kind,
  id,
  isFavorited,
  variant = "pill",
  className,
}: {
  kind: FavoriteKind;
  id: string;
  isFavorited: boolean;
  /** "pill" — inline labeled button (account rows, page headers).
   *  "corner" — icon-only heart meant to sit absolutely positioned in the
   *  top-right corner of a card (see `.favorite-corner` in globals.css).
   *  "icon" — icon-only heart meant to sit inline alongside other compact
   *  icon actions (see `.round-icon-btn` in globals.css), with a hover
   *  tooltip explaining what it does. */
  variant?: "pill" | "corner" | "icon";
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await actionByKind[kind](id);
    });
  }

  if (variant === "corner") {
    return (
      <button
        type="button"
        className={`favorite-corner ${isFavorited ? "is-favorited" : ""} ${className ?? ""}`}
        disabled={isPending}
        aria-pressed={isFavorited}
        aria-label={isFavorited ? "Убрать из избранного" : "В избранное"}
        title={isFavorited ? "Убрать из избранного" : "В избранное"}
        onClick={handleClick}
      >
        <HeartIcon filled={isFavorited} />
      </button>
    );
  }

  if (variant === "icon") {
    const label = isFavorited ? "Убрать из избранного" : "В избранное";
    return (
      <button
        type="button"
        className={`round-icon-btn ${isFavorited ? "is-favorited" : ""} ${className ?? ""}`}
        disabled={isPending}
        aria-pressed={isFavorited}
        aria-label={label}
        data-tooltip={label}
        onClick={handleClick}
      >
        <HeartIcon filled={isFavorited} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={className ?? "favorite-pill"}
      disabled={isPending}
      aria-pressed={isFavorited}
      onClick={handleClick}
    >
      <HeartIcon filled={isFavorited} />
      {isFavorited ? "В избранном" : "В избранное"}
    </button>
  );
}
