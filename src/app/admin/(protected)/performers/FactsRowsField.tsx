"use client";

import { useState } from "react";

export type FactPair = { en: string; ru: string };

/**
 * Факты артиста в форме — строка к строке «английский | русский»
 * (правка владельца 2026-09-26: «в админке править по полям, а не
 * сплошным текстом»). Раньше английские шли одним полем по строке на
 * факт, а русские — отдельно во вкладке «Перевод»: удалишь строку в
 * одном и не повторишь в другом — переводы съезжали на чужие факты.
 * Здесь пара неразрывна: удаляется и переставляется целиком.
 *
 * В форму уходят скрытые поля `triviaEn` / `triviaRu` — по одному на
 * строку, в одном порядке; пустой перевод держит место.
 */
export default function FactsRowsField({ initial }: { initial: FactPair[] }) {
  const [rows, setRows] = useState<FactPair[]>(initial.length ? initial : [{ en: "", ru: "" }]);
  const set = (i: number, patch: Partial<FactPair>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <div>
      <div className="d-flex flex-column gap-2">
        {rows.map((r, i) => (
          <div key={i} className="facts-pair">
            <span className="facts-pair-num small text-secondary">{i + 1}</span>
            <textarea
              className="form-control form-control-sm facts-input"
              rows={1}
              value={r.en}
              placeholder="Факт (английский)"
              aria-label={`Факт ${i + 1}, английский`}
              onChange={(e) => set(i, { en: e.target.value })}
            />
            <textarea
              className="form-control form-control-sm facts-input"
              rows={1}
              value={r.ru}
              placeholder="Перевод — не обязателен"
              aria-label={`Факт ${i + 1}, перевод`}
              onChange={(e) => set(i, { ru: e.target.value })}
            />
            <span className="facts-pair-tools">
              <button type="button" className="btn btn-ghost btn-sm px-1" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Выше">↑</button>
              <button type="button" className="btn btn-ghost btn-sm px-1" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Ниже">↓</button>
              <button type="button" className="btn btn-ghost btn-sm px-1 text-danger" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Удалить факт">×</button>
            </span>
            <input type="hidden" name="triviaEn" value={r.en} />
            <input type="hidden" name="triviaRu" value={r.ru} />
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-outline-secondary btn-sm mt-2" onClick={() => setRows((rs) => [...rs, { en: "", ru: "" }])}>
        + Добавить факт
      </button>
    </div>
  );
}
