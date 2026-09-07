"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDramaRating } from "@/app/(public)/favorites/actions";
import { useT } from "@/components/LocaleProvider";
import StarRatingInput, { formatRating } from "@/components/StarRatingInput";

/**
 * Своя оценка сериалу — десять звёзд с половинками (АА2; половинки —
 * правка владельца 2026-09-07).
 *
 * Отдельная от отзыва вещь: `Drama.mdlScore` — оценка MyDramaList,
 * «★ 8.4» рядом — сводная, а это личное «мне на девять с половиной».
 * Раньше поставить её можно было только написав отзыв.
 *
 * Повторный клик по той же половинке снимает оценку — привычный способ
 * передумать, отдельная кнопка ради этого не нужна.
 *
 * Значение держим локально и рисуем сразу: звёзды должны загораться под
 * пальцем, а не после ответа сервера. `router.refresh()` следом
 * подтягивает остальное — своя оценка входит в среднее по сайту.
 */
export default function DramaRating({
  dramaId,
  rating,
  hideLabel = false,
}: {
  dramaId: string;
  /** Поставленная оценка 1-10; null — не оценивал. */
  rating: number | null;
  /** Подпись «Моя оценка» рисует вызывающий — например, колонка подписей
   *  в блоке фактов сериала, где все строки выровнены по ней. */
  hideLabel?: boolean;
}) {
  const t = useT();
  const s = t.catalog.rating;
  const router = useRouter();
  const [value, setValue] = useState(rating);
  const [isPending, startTransition] = useTransition();

  // Оценка могла смениться не отсюда (импорт списка с MDL, вторая
  // вкладка) — подравниваем в рендере, как в EpisodeProgress: useState
  // читает начальное значение только при монтировании.
  const [seen, setSeen] = useState(rating);
  if (rating !== seen) {
    setSeen(rating);
    setValue(rating);
  }

  function choose(next: number | null) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      // Ошибку экшен отдаёт значением (текст исключения в проде до
      // клиента не доезжает) — молча откатываем звёзды.
      const result = await setDramaRating(dramaId, next);
      if (!result.ok) {
        setValue(previous);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="drama-rating">
      {!hideLabel && <span className="small text-secondary">{s.label}</span>}
      <StarRatingInput
        value={value}
        onChange={choose}
        disabled={isPending}
        labelFor={(n) => (n === value ? s.clear : s.choose(formatRating(n)))}
        hintFor={(n) => s.hint(formatRating(n))}
      />
      {/* Цифра рядом со звёздами: считать звёзды глазами неудобно, а
          «9/10» читается сразу. Пока не оценили — тут пусто: слово
          «Оценить» выглядело кнопкой, которой не является (правка
          владельца 2026-09-07), а звёзды и так зовут по себе. */}
      {value != null && (
        <span className="drama-rating-value">{`${formatRating(value)}/10`}</span>
      )}
    </div>
  );
}
