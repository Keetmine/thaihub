"use client";

import { useState } from "react";
import StarRatingInput, { formatRating } from "@/components/StarRatingInput";
import { useT } from "@/components/LocaleProvider";

/**
 * Оценки в форме отзыва (правка владельца 2026-09-07).
 *
 * Была одна цифра из выпадающего списка — стало несколько звёздных
 * шкал: сюжет, актёры, музыка и общая. Разделы необязательны, общая —
 * обязательна: именно она попадает в средний рейтинг записи, а разделы
 * дают понять, ЧТО именно понравилось.
 *
 * Набор разделов зависит от типа записи: у новеллы нет актёров, у
 * события — ни сюжета, ни актёрской игры. Решает вызывающая сторона —
 * `fields`.
 *
 * Общая оценка, пока её не трогали руками, идёт за средним по
 * заполненным разделам: поставил 9/8/7 — внизу само встало 8. Как
 * только человек ткнул в общую сам, она перестаёт бегать за разделами:
 * его выбор важнее подсказки.
 *
 * Значения уезжают в server action скрытыми полями — форма остаётся
 * обычной, серверной (`saveReview`).
 */

export type ReviewRatingField = "story" | "acting" | "music";

const INPUT_NAME: Record<ReviewRatingField, string> = {
  story: "ratingStory",
  acting: "ratingActing",
  music: "ratingMusic",
};

export default function ReviewRatingFields({
  fields,
  initial,
}: {
  /** Какие разделы показывать (кроме общей — она есть всегда). */
  fields: ReviewRatingField[];
  initial: { overall: number | null } & Partial<Record<ReviewRatingField, number | null>>;
}) {
  const t = useT();
  const s = t.reviews.rating;
  const [parts, setParts] = useState<Partial<Record<ReviewRatingField, number | null>>>({
    story: initial.story ?? null,
    acting: initial.acting ?? null,
    music: initial.music ?? null,
  });
  const [overall, setOverall] = useState<number | null>(initial.overall);
  // Правил ли человек общую сам. У сохранённого отзыва — считаем, что да:
  // подтягивать её под разделы при редактировании было бы самоуправством.
  const [overallTouched, setOverallTouched] = useState(initial.overall != null);

  function setPart(field: ReviewRatingField, value: number | null) {
    const next = { ...parts, [field]: value };
    setParts(next);
    if (overallTouched) return;
    const filled = fields.map((f) => next[f]).filter((v): v is number => v != null);
    if (filled.length === 0) {
      setOverall(null);
      return;
    }
    // К ближайшей половине — шкала везде одна.
    const avg = filled.reduce((a, b) => a + b, 0) / filled.length;
    setOverall(Math.round(avg * 2) / 2);
  }

  return (
    <div className="d-flex flex-column gap-2">
      {fields.map((field) => (
        <div key={field} className="review-rating-row">
          <span className="small text-secondary review-rating-label">{s[field]}</span>
          <StarRatingInput
            value={parts[field] ?? null}
            onChange={(next) => setPart(field, next)}
            labelFor={(n) => s.choose(s[field], formatRating(n))}
          />
          <span className="small text-secondary review-rating-value">
            {parts[field] != null ? formatRating(parts[field] as number) : ""}
          </span>
          <input type="hidden" name={INPUT_NAME[field]} value={parts[field] ?? ""} />
        </div>
      ))}

      <div className="review-rating-row">
        <span className="small text-secondary review-rating-label fw-medium">{s.overall}</span>
        <StarRatingInput
          value={overall}
          onChange={(next) => {
            setOverall(next);
            setOverallTouched(next != null);
          }}
          labelFor={(n) => s.choose(s.overall, formatRating(n))}
        />
        <span className="small text-secondary review-rating-value">
          {overall != null ? formatRating(overall) : ""}
        </span>
        <input type="hidden" name="rating" value={overall ?? ""} />
      </div>
      {/* Пока общая не тронута руками, она сама идёт за разделами —
          говорим об этом прямо, чтобы её движение не выглядело сбоем. */}
      {!overallTouched && overall != null && (
        <p className="form-text mb-0">{s.overallAuto}</p>
      )}
    </div>
  );
}
