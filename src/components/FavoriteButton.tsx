"use client";

import { useState, useTransition } from "react";
import {
  toggleFavoriteAgency,
  toggleFavoritePerformer,
} from "@/app/(public)/favorites/actions";
import { HeartIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

export type FavoriteKind = "performer" | "agency";

// Экшен может вернуть ошибку значением `{ ok: false, error }` (текст
// исключения в проде до клиента не доезжает) — сердечко тогда
// откатывается, как и при броске.
const actionByKind: Record<
  FavoriteKind,
  (id: string) => Promise<void | { ok: boolean }>
> = {
  performer: toggleFavoritePerformer,
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
  const t = useT();
  const [isPending, startTransition] = useTransition();

  // Оптимистичное локальное состояние: сердечко закрашивается сразу по
  // клику, не дожидаясь сервера. Особенно важно в бесконечной ленте —
  // она клиентская с накопленным состоянием, и revalidatePath серверной
  // страницы её не перерисовывает. Проп с сервера при этом остаётся
  // источником истины: если он поменялся (навигация/refresh), локальное
  // состояние пересинхронизируется.
  const [active, setActive] = useState(isFavorited);
  const [prevProp, setPrevProp] = useState(isFavorited);
  if (isFavorited !== prevProp) {
    setPrevProp(isFavorited);
    setActive(isFavorited);
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !active;
    setActive(next);
    startTransition(async () => {
      try {
        const result = await actionByKind[kind](id);
        if (result && !result.ok) setActive(!next);
      } catch {
        setActive(!next);
      }
    });
  }

  if (variant === "corner") {
    return (
      <button
        type="button"
        className={`favorite-corner ${active ? "is-favorited" : ""} ${className ?? ""}`}
        disabled={isPending}
        aria-pressed={active}
        aria-label={active ? t.widgets.favorite.remove : t.widgets.favorite.add}
        title={active ? t.widgets.favorite.remove : t.widgets.favorite.add}
        onClick={handleClick}
      >
        <HeartIcon filled={active} />
      </button>
    );
  }

  if (variant === "icon") {
    const label = active ? t.widgets.favorite.remove : t.widgets.favorite.add;
    return (
      <button
        type="button"
        className={`round-icon-btn ${active ? "is-favorited" : ""} ${className ?? ""}`}
        disabled={isPending}
        aria-pressed={active}
        aria-label={label}
        data-tooltip={label}
        onClick={handleClick}
      >
        <HeartIcon filled={active} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={className ?? "favorite-pill"}
      disabled={isPending}
      aria-pressed={active}
      onClick={handleClick}
    >
      <HeartIcon filled={active} />
      {active ? t.widgets.favorite.added : t.widgets.favorite.add}
    </button>
  );
}
