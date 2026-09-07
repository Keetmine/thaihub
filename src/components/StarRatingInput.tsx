"use client";

import { useState } from "react";
import { StarIcon } from "@/components/icons";

/**
 * ПЯТЬ звёзд на шкалу 1-10 (правка владельца 2026-09-07: «звёздочки
 * компактнее, не 10 а 5»).
 *
 * Шкала в базе осталась десятибалльной — той же, что у MyDramaList:
 * звезда стоит два балла, половина звезды — один. Кликом ставятся
 * целые баллы (1-10); дробное значение, приехавшее импортом с MDL
 * («8.5»), сохраняется и рисуется точно — заливка у звезды не обязана
 * быть ровно половинной.
 *
 * Половина ставится левой половиной звезды, целая — правой: два
 * прозрачных «клика» поверх одной иконки.
 *
 * Заливка — вторым слоем поверх контурной звезды, обрезанным по ширине
 * (`overflow: hidden`), а не полузакрашенной иконкой: иконка одна, а
 * заливка любая, и SVG-градиенту тут пришлось бы выдавать уникальный id
 * на каждую звезду.
 *
 * Управление только мышью было бы недоступным, поэтому клавиатура
 * работает по самим кнопкам: Tab доводит до половинки, Enter ставит.
 */

/** Сколько баллов в одной звезде: пять звёзд на десятибалльную шкалу. */
const PER_STAR = 2;
const STARS = 5;

export default function StarRatingInput({
  value,
  onChange,
  disabled = false,
  size,
  labelFor,
}: {
  /** Текущая оценка 1-10; null — не оценено. Дробное значение с MDL
   *  («8.5») рисуется как есть. */
  value: number | null;
  /** Кликнули по той же оценке — приходит null: «передумал». */
  onChange: (next: number | null) => void;
  disabled?: boolean;
  /** CSS-размер звезды (font-size); по умолчанию — из стилей. */
  size?: string;
  /** Как назвать оценку скринридеру: «Поставить 9 из 10». */
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
      {Array.from({ length: STARS }, (_, i) => i + 1).map((star) => {
        // Баллы, которые ставят половинки этой звезды: 1 и 2, 3 и 4, …
        const half = star * PER_STAR - 1;
        const full = star * PER_STAR;
        // Насколько звезда закрашена. Считаем долей, а не тремя
        // состояниями: «8.5» с MDL — это три четверти пятой звезды, и
        // округлять её до половины значило бы врать про оценку.
        const fill = Math.max(0, Math.min(1, (shown - (star - 1) * PER_STAR) / PER_STAR)) * 100;
        return (
          <span key={star} className="star-rating-star">
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
              aria-label={labelFor(half)}
              onMouseEnter={() => setHover(half)}
              onFocus={() => setHover(half)}
              onBlur={() => setHover(null)}
              onClick={() => pick(half)}
            />
            <button
              type="button"
              className="star-rating-half is-right"
              disabled={disabled}
              aria-label={labelFor(full)}
              onMouseEnter={() => setHover(full)}
              onFocus={() => setHover(full)}
              onBlur={() => setHover(null)}
              onClick={() => pick(full)}
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
