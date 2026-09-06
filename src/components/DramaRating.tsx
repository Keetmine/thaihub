"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDramaRating } from "@/app/(public)/favorites/actions";
import { useT } from "@/components/LocaleProvider";
import { StarIcon } from "@/components/icons";

/**
 * Своя оценка сериалу — десять звёзд (АА2).
 *
 * Отдельная от отзыва вещь: `Drama.mdlScore` — общая оценка с
 * MyDramaList, «★ 8.4» рядом — средняя по сайту, а это личное «мне на
 * девять». Раньше поставить её можно было только написав отзыв.
 *
 * Повторный клик по той же звезде снимает оценку — привычный способ
 * передумать, отдельная кнопка «убрать» ради этого не нужна.
 *
 * Значение держим локально и рисуем сразу: звёзды должны загораться под
 * пальцем, а не после ответа сервера. `router.refresh()` следом
 * подтягивает остальное — оценка видна и в профиле.
 *
 * Два вида: `full` — с подписью «Моя оценка» (страница сериала);
 * `inline` — только звёзды, для строк таблицы в профиле.
 */
export default function DramaRating({
  dramaId,
  rating,
  variant = "full",
}: {
  dramaId: string;
  /** Поставленная оценка 1-10; null — не оценивал. */
  rating: number | null;
  variant?: "full" | "inline";
}) {
  const t = useT();
  const s = t.catalog.rating;
  const router = useRouter();
  const [value, setValue] = useState(rating);
  const [hover, setHover] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  // Оценка могла смениться не отсюда (импорт списка с MDL, вторая
  // вкладка) — подравниваем в рендере, как в EpisodeProgress: useState
  // читает начальное значение только при монтировании.
  const [seen, setSeen] = useState(rating);
  if (rating !== seen) {
    setSeen(rating);
    setValue(rating);
  }

  function choose(next: number) {
    // Клик по уже горящей звезде — «передумал», снимаем.
    const target = next === value ? null : next;
    const previous = value;
    setValue(target);
    startTransition(async () => {
      // Ошибку экшен отдаёт значением (текст исключения в проде до
      // клиента не доезжает) — молча откатываем звёзды.
      const result = await setDramaRating(dramaId, target);
      if (!result.ok) {
        setValue(previous);
        return;
      }
      router.refresh();
    });
  }

  const shown = hover ?? value ?? 0;

  return (
    <div className={`drama-rating is-${variant}`}>
      {variant === "full" && <span className="small text-secondary">{s.label}</span>}
      <div
        className="drama-rating-stars"
        onMouseLeave={() => setHover(null)}
        role="radiogroup"
        aria-label={s.label}
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`drama-rating-star ${n <= shown ? "is-on" : ""}`}
            disabled={isPending}
            role="radio"
            aria-checked={value === n}
            aria-label={value === n ? s.clear : s.choose(n)}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => choose(n)}
          >
            <StarIcon />
          </button>
        ))}
      </div>
      {/* Цифра рядом со звёздами: считать десять иконок глазами
          неудобно, а «9 из 10» читается сразу. Пока не оценили —
          зовём это сделать. */}
      <span className="drama-rating-value">{value != null ? `${value}/10` : s.none}</span>
    </div>
  );
}
