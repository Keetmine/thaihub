"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyFacts, rejectFacts } from "../actions";
import type { FactRow } from "@/lib/factsReview";

/**
 * Разбор фактов руками (просьба владельца 2026-09-26): три колонки —
 * «до» (наш факт), «после объединения» (что уйдёт на сайт; новые с
 * источника отмечены «+») и «перевод» (наш русский, если был; у новых
 * пусто, перевод не обязателен). Строка на факт: перевод стоит напротив своего
 * оригинала, промахнуться строкой нельзя. «Применить» берёт таблицу
 * как есть.
 */
export default function FactsTable({ id, initial, decided }: { id: string; initial: FactRow[]; decided: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (i: number, patch: Partial<FactRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const add = () => setRows((rs) => [...rs, { original: null, en: "", ru: "" }]);

  const missingRu = rows.filter((r) => r.en.trim() && !r.ru.trim()).length;
  const added = rows.filter((r) => r.original === null).length;

  function apply() {
    setError(null);
    start(async () => {
      const r = await applyFacts(id, rows.map(({ en, ru }) => ({ en, ru })));
      if (!r.ok) setError(r.error ?? "Не применилось");
      else router.refresh();
    });
  }
  function reject() {
    start(async () => {
      await rejectFacts(id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="table-responsive surface p-0">
        <table className="table facts-table mb-0 align-top">
          <thead>
            <tr>
              <th style={{ width: "28%" }}>До</th>
              <th style={{ width: "36%" }}>После объединения</th>
              <th style={{ width: "36%" }}>Перевод</th>
              {!decided && <th aria-label="Удалить" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isNew = r.original === null;
              const edited = !isNew && r.en.trim() !== r.original!.trim();
              return (
                <tr key={i} className={isNew ? "is-add" : edited ? "is-edit" : undefined}>
                  <td className="small text-secondary">
                    {isNew ? <span className="facts-diff-mark">+</span> : r.original}
                  </td>
                  <td>
                    <textarea
                      className="form-control form-control-sm facts-input"
                      rows={2}
                      value={r.en}
                      onChange={(e) => set(i, { en: e.target.value })}
                      disabled={decided}
                    />
                  </td>
                  <td>
                    <textarea
                      className="form-control form-control-sm facts-input"
                      rows={2}
                      value={r.ru}
                      placeholder="без перевода"
                      onChange={(e) => set(i, { ru: e.target.value })}
                      disabled={decided}
                    />
                  </td>
                  {!decided && (
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => remove(i)} aria-label="Удалить строку">
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!decided && (
        <>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={add}>
              + Добавить факт
            </button>
            <span className="small text-secondary">
              Новых {added}
              {missingRu > 0 && <span> · без перевода {missingRu}</span>}
            </span>
            <button type="button" className="btn btn-ghost btn-sm text-danger ms-auto" onClick={reject} disabled={pending}>
              Отклонить
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={pending}>
              {pending ? "Применяем…" : "Применить на сайт"}
            </button>
          </div>
          {missingRu > 0 && (
            <p className="small text-secondary mt-2 mb-0">
              Перевод не обязателен: факт без перевода на русской странице не
              покажется, пока его не переведут.
            </p>
          )}
          {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
        </>
      )}
    </div>
  );
}
