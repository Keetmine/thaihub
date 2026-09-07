"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  changeRewatchCount,
  startRewatch,
} from "@/app/(public)/favorites/actions";
import { useT } from "@/components/LocaleProvider";

/** Тот же потолок, что и в `changeRewatchCount`. Здесь он нужен только
 *  затем, чтобы кнопка «+» гасла на границе, а не молча упиралась в
 *  сервер: правда о числе всё равно за экшеном. */
const MAX_REWATCHES = 99;

/**
 * «Пересматривала пять раз» — счётчик просмотров на странице сериала.
 *
 * Живёт отдельно от `EpisodeProgress`, хотя выглядит роднёй: тот стоит
 * и в каталоге, и на карточках «Смотрю сейчас», а пересмотры уместны
 * только там, где сериал уже досмотрен, — в списках это лишний шум.
 *
 * `count` — просмотры СВЕРХ первого (как в базе), а показываем `count +
 * 1`: человек считает просмотры целиком, «смотрела 3 раза», и цифра «2»
 * рядом с досмотренным сериалом читалась бы как ошибка.
 *
 * Цифра меняется сразу, не дожидаясь сервера, — как у счётчика серий:
 * `router.refresh()` следом подтягивает остальную страницу, ошибка
 * откатывает оптимистичное число.
 */
export default function RewatchCounter({
  dramaId,
  count,
  status,
}: {
  dramaId: string;
  /** `DramaWatchStatus.rewatchCount`: 0 — сериал смотрели один раз. */
  count: number;
  /** Текущий статус просмотра: у досмотренного показываем «Смотреть
   *  заново», у идущего пересмотра — какой это заход по счёту. */
  status: string;
}) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState(count);
  const [seen, setSeen] = useState(count);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Prop мог обновиться не от нашего клика (соседняя вкладка, refresh
  // после смены статуса) — подравниваемся прямо в рендере, как это
  // делает EpisodeProgress: useEffect дал бы лишний кадр со старым
  // числом. Пока свой запрос в полёте, prop ещё старый и сюда не зайдём.
  if (count !== seen) {
    setSeen(count);
    setValue(count);
  }

  // Пересмотр идёт: статус вернулся в «Смотрю сейчас», а просмотров
  // уже больше одного. Только в этом случае число значит «какой заход»,
  // а не «сколько раз посмотрела».
  const rewatching = status === "WATCHING" && value > 0;

  function begin() {
    setError(null);
    const previous = value;
    // Считаем сразу, как и на сервере: кнопка должна отзываться, а не
    // ждать круга до базы и обратно.
    setValue(value + 1);
    startTransition(async () => {
      const result = await startRewatch(dramaId);
      if (!result.ok) {
        setValue(previous);
        setError(result.error);
        return;
      }
      // Обновляем страницу целиком: вместе со статусом переехали и
      // счётчик серий, и колокольчик, и списки «Смотрю сейчас».
      router.refresh();
    });
  }

  function change(delta: 1 | -1) {
    const next = Math.min(MAX_REWATCHES, Math.max(0, value + delta));
    if (next === value) return;
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      // Ошибка приходит значением: в проде текст исключения из server
      // action до клиента не доезжает (см. favorites/actions.ts).
      const result = await changeRewatchCount(dramaId, delta);
      if (!result.ok) {
        setValue(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="episode-progress">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span className="small text-secondary">
          {rewatching
            ? t.catalog.rewatch.inProgress(value + 1)
            : t.catalog.rewatch.label}
        </span>
        <div className="episode-progress-controls">
          <button
            type="button"
            className="episode-progress-step"
            disabled={isPending || value === 0}
            aria-label={t.catalog.rewatch.minus}
            onClick={() => change(-1)}
          >
            −
          </button>
          {/* Число вместе со словом («3 раза»), а не голая цифра: рядом
              со счётчиком серий две одинокие цифры путались бы между
              собой. Инпута тут нет намеренно — пересмотры набегают по
              одному, а не десятками, как серии. */}
          <span className="episode-progress-count">
            {t.catalog.rewatch.times(value + 1)}
          </span>
          <button
            type="button"
            className="episode-progress-step"
            disabled={isPending || value >= MAX_REWATCHES}
            aria-label={t.catalog.rewatch.plus}
            onClick={() => change(1)}
          >
            +
          </button>
        </div>
        {/* «Смотреть заново» — только у досмотренного: она возвращает
            статус «Смотрю сейчас» и обнуляет серии, а у того, кто уже
            смотрит, это отняло бы прогресс. */}
        {status === "COMPLETED" && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={isPending}
            onClick={begin}
          >
            {t.catalog.rewatch.start}
          </button>
        )}
      </div>
      {error && <p className="small text-danger mb-0 mt-1">{error}</p>}
    </div>
  );
}
