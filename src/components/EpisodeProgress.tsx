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
 * Три вида по месту:
 * - `full` — с подписью «Серии» и полосой (страница сериала);
 * - `inline` — без подписи, узкий, полоса под счётчиком (строка
 *   каталога: там он стоит справа, у кнопки статуса, и лишнюю ширину
 *   отнимать не должен);
 * - `card` — без подписи и без полосы, во всю ширину карточки: полосу
 *   карточка рисует у себя внутри, поверх постера, а две полосы в
 *   четырёх сантиметрах друг от друга выглядели бы небрежно.
 */
export default function EpisodeProgress({
  dramaId,
  total,
  watched,
  variant = "full",
}: {
  dramaId: string;
  /** Сколько серий у сериала; null — неизвестно. */
  total: number | null;
  /** Сколько отмечено; null — не отмечал вовсе. */
  watched: number | null;
  variant?: "full" | "inline" | "card";
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

  const card = variant === "card";

  return (
    <div className={`episode-progress is-${variant}`}>
      <div className="d-flex align-items-center gap-2">
        {variant === "full" && (
          <span className="small text-secondary">{t.catalog.episodes.label}</span>
        )}
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
      {!card && total !== null && total > 0 && (
        <EpisodeProgressBar
          watched={value}
          total={total}
          label={t.catalog.episodes.of(value, total)}
        />
      )}
    </div>
  );
}

/**
 * Сама полоса — отдельно и без "use client" по назначению: её рисуют и
 * места, где менять прогресс не нужно (постер карточки, фильмография
 * артиста). Там счётчик на каждую карточку был бы и тесен, и напрасно
 * утяжелял бы страницу клиентским кодом.
 *
 * Цифры рисует не она: там, где полоса стоит на карточке, цифры на
 * каждой карточке ряда превратили бы его в таблицу. Число человек
 * видит там, где прогресс правит, — `label` остаётся для скринридера.
 */
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
    <span
      className="episode-progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={watched}
      aria-label={label}
    >
      <span style={{ width: `${percent}%` }} />
    </span>
  );
}
