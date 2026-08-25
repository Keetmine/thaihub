"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDramaEpisodesWatched } from "@/app/(public)/favorites/actions";
import { useT } from "@/components/LocaleProvider";

/**
 * «На какой серии я остановился»: счётчик + полоса прогресса.
 *
 * Число держим в локальном состоянии и рисуем сразу, не дожидаясь
 * сервера: досмотрел серию — нажал плюс, и это должно быть мгновенно.
 * `router.refresh()` следом подтягивает остальную страницу (статус мог
 * переехать в «Просмотрено», и список «Смотрю сейчас» это учтёт).
 *
 * `compact` — для карточки: только кнопка «+1», полоса там рисуется
 * внутри самой карточки (PosterTile), потому что вся карточка — ссылка,
 * а кнопку внутрь ссылки класть нельзя.
 */
export default function EpisodeProgress({
  dramaId,
  total,
  watched,
  compact = false,
}: {
  dramaId: string;
  /** Сколько серий у сериала; null — неизвестно. */
  total: number | null;
  /** Сколько отмечено; null — не отмечал вовсе. */
  watched: number | null;
  compact?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState(watched ?? 0);
  const [seen, setSeen] = useState(watched);
  const [isPending, startTransition] = useTransition();

  // Число могло измениться не отсюда: например, статус переставили на
  // «Просмотрено», и сервер досчитал серии до конца. Локальное состояние
  // об этом не узнает — useState читает начальное значение только при
  // монтировании, — поэтому подравниваем его прямо в рендере (так React
  // советует делать вместо useEffect: лишнего кадра со старым числом не
  // будет). Пока свой запрос в полёте, prop ещё старый и сюда не зайдём.
  if (watched !== seen) {
    setSeen(watched);
    setValue(watched ?? 0);
  }

  const done = total !== null && value >= total;

  function set(next: number) {
    const clamped = Math.max(0, total !== null ? Math.min(next, total) : next);
    if (clamped === value) return;
    setValue(clamped);
    startTransition(async () => {
      await setDramaEpisodesWatched(dramaId, clamped);
      router.refresh();
    });
  }

  if (compact) {
    // Досмотрел всё — прибавлять нечего, кнопка только мешала бы.
    if (done) return null;
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm w-100 mt-1 py-1"
        disabled={isPending}
        aria-label={t.catalog.episodes.watchedOne}
        onClick={() => set(value + 1)}
      >
        {t.catalog.episodes.plusOne}
      </button>
    );
  }

  return (
    <div className="episode-progress">
      <div className="d-flex align-items-center gap-2">
        <span className="small text-secondary">{t.catalog.episodes.label}</span>
        <div className="episode-progress-controls">
          <button
            type="button"
            className="episode-progress-step"
            disabled={isPending || value === 0}
            aria-label={t.catalog.episodes.minus}
            onClick={() => set(value - 1)}
          >
            −
          </button>
          <span className="episode-progress-count">
            {total !== null ? t.catalog.episodes.of(value, total) : value}
          </span>
          <button
            type="button"
            className="episode-progress-step"
            disabled={isPending || done}
            aria-label={t.catalog.episodes.plus}
            onClick={() => set(value + 1)}
          >
            +
          </button>
        </div>
      </div>
      {total !== null && total > 0 && (
        <EpisodeProgressBar watched={value} total={total} label={t.catalog.episodes.of(value, total)} />
      )}
    </div>
  );
}

/** Сама полоса — отдельно, потому что её же рисует карточка, где
 *  интерактива нет вовсе. */
export function EpisodeProgressBar({
  watched,
  total,
  label,
}: {
  watched: number;
  total: number;
  label: string;
}) {
  const percent = Math.max(0, Math.min(100, Math.round((watched / total) * 100)));
  return (
    <div
      className="episode-progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={watched}
      aria-label={label}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
