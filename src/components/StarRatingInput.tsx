"use client";

import { useState } from "react";
import { StarIcon } from "@/components/icons";

/**
 * Десять звёзд с ПОЛОВИНКАМИ (правка владельца 2026-09-07).
 *
 * Шкала с шагом 0.5 — та же, что у MyDramaList: раньше их «8.5» при
 * импорте округлялась до девятки, и своя оценка не совпадала с тем, что
 * человек поставил там.
 *
 * Половинка ставится левой половиной звезды, целое — правой: два
 * прозрачных «клика» поверх одной иконки. Отдельного переключателя
 * «половинки» нет — он бы только мешал.
 *
 * Заливка — вторым слоем поверх контурной звезды, обрезанным по ширине
 * (`width: 50%` + `overflow: hidden`), а не полузакрашенной иконкой:
 * иконка одна, а вариантов заливки два, и SVG-градиенту тут пришлось бы
 * выдавать уникальный id на каждую звезду.
 *
 * Управление только мышью было бы недоступным, поэтому клавиатура
 * работает по самим кнопкам: Tab доводит до половинки, Enter ставит.
 */
export default function StarRatingInput({
  value,
  onChange,
  disabled = false,
  size,
  labelFor,
}: {
  /** Текущая оценка 0.5-10 с шагом 0.5; null — не оценено. */
  value: number | null;
  /** Кликнули по той же оценке — приходит null: «передумал». */
  onChange: (next: number | null) => void;
  disabled?: boolean;
  /** CSS-размер звезды (font-size); по умолчанию — из стилей. */
  size?: string;
  /** Как назвать оценку скринридеру: «Поставить 8.5 из 10». */
  labelFor: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  function pick(next: number) {
    onChange(next === value ? null : next);
  }

  return (
    <span
      className="star-rating"
      style={size ? { fontSize: size } : undefined}
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        // Сколько этой звезды закрашено: целая, половина или ничего.
        const fill = shown >= n ? 100 : shown >= n - 0.5 ? 50 : 0;
        return (
          <span key={n} className="star-rating-star">
            <span className="star-rating-base" aria-hidden>
              <StarIcon />
            </span>
            {fill > 0 && (
              <span className="star-rating-fill" style={{ width: `${fill}%` }} aria-hidden>
                <StarIcon />
              </span>
            )}
            {/* Две половины-кнопки поверх иконки. */}
            <button
              type="button"
              className="star-rating-half is-left"
              disabled={disabled}
              aria-label={labelFor(n - 0.5)}
              onMouseEnter={() => setHover(n - 0.5)}
              onFocus={() => setHover(n - 0.5)}
              onBlur={() => setHover(null)}
              onClick={() => pick(n - 0.5)}
            />
            <button
              type="button"
              className="star-rating-half is-right"
              disabled={disabled}
              aria-label={labelFor(n)}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(null)}
              onClick={() => pick(n)}
            />
          </span>
        );
      })}
    </span>
  );
}

/** Показать оценку числом: «8.5», но «9» без лишнего нуля. */
export function formatRating(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
