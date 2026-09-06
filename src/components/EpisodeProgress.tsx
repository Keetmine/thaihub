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
 * - `inline` — тихий счётчик «2/10» без полосы и без плашки (колонка
 *   прогресса в таблице каталога, правка владельца 2026-09-05: кнопки
 *   не должны бросаться в глаза, полосе в списке не место);
 * - `card` — под постером «Смотрю сейчас»: тихая пилюля «− 3/9 +» по
 *   центру. Полосы у неё нет — её рисует сама карточка поверх постера,
 *   а две полосы в четырёх сантиметрах друг от друга выглядели бы
 *   небрежно. Раньше контролы растягивались во всю ширину карточки, и
 *   между минусом и плюсом зияла пустота (правка владельца
 *   2026-09-06).
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
  const [draft, setDraft] = useState(String(watched ?? 0));
  const [seen, setSeen] = useState(watched);
  const [error, setError] = useState<string | null>(null);
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
    setDraft(String(watched ?? 0));
  }

  const done = total !== null && value >= total;

  function set(next: number) {
    const clamped = Math.max(0, total !== null ? Math.min(next, total) : next);
    setDraft(String(clamped));
    if (clamped === value) return;
    const previous = value;
    setValue(clamped);
    setError(null);
    startTransition(async () => {
      // Ошибка приходит значением (текст исключения в проде до клиента
      // не доезжает) — откатываем оптимистичное число и показываем её.
      const result = await setDramaEpisodesWatched(dramaId, clamped);
      if (!result.ok) {
        setValue(previous);
        setDraft(String(previous));
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  /** Набранное руками — в те же рамки, что и кнопки; мусор откатывается
   *  к текущему значению, а не превращается в ноль. */
  function commitDraft() {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    set(parsed);
  }

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
          {/* На странице сериала число — инпут (правка владельца):
              ввести «9» сразу быстрее, чем девять раз нажать плюс.
              Черновик локальный, в базу уходит по Enter или уходу из
              поля, с обрезкой в границы. В списках (таблица каталога и
              карточка «Смотрю сейчас») — просто текст: рамка поля
              посреди «3/10» смотрелась криво, и число там меняют
              кнопками (правки владельца 2026-09-06). */}
          {variant !== "full" ? (
            <span className="episode-progress-value">{value}</span>
          ) : (
            <input
              type="number"
              className="episode-progress-input"
              min={0}
              max={total ?? undefined}
              value={draft}
              disabled={isPending}
              aria-label={t.catalog.episodes.label}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitDraft()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitDraft();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          )}
          {total !== null && (
            <span className="episode-progress-count">
              {/* В таблице каталога — «/10» вплотную к числу; в полном
                  виде остаётся словесное «из 10». */}
              {variant === "full" ? t.catalog.episodes.ofTotal(total) : `/${total}`}
            </span>
          )}
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
      {variant === "full" && total !== null && total > 0 && (
        <EpisodeProgressBar
          watched={value}
          total={total}
          label={t.catalog.episodes.of(value, total)}
        />
      )}
      {error && <p className="small text-danger mb-0 mt-1">{error}</p>}
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
