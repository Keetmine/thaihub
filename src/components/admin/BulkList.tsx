"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConfirmForm from "@/components/ConfirmForm";

export type BulkOption = { id: string; name: string };

/** Действие над выделенными строками. `delete` спрашивает подтверждение,
 *  `select` сначала требует выбрать значение (агентство, статус…). */
export type BulkAction =
  | {
      kind: "delete";
      label: string;
      /** Текст подтверждения; {n} заменяется числом выбранных записей.
       *  Именно шаблон, а не функция: действия приезжают из серверного
       *  компонента, а туда можно передать только данные и server actions. */
      confirmTemplate: string;
      run: (ids: string[]) => Promise<void>;
    }
  | {
      kind: "select";
      label: string;
      placeholder: string;
      options: BulkOption[];
      run: (ids: string[], value: string) => Promise<void>;
    };

/**
 * Список админки с выделением строк и панелью массовых действий.
 * Чистить импортный мусор по одной записи было слишком долго: удалить
 * два десятка пустых карточек или перевесить группу артистов на другое
 * агентство — теперь одно действие.
 */
export default function BulkList({
  rows,
  actions,
  className = "d-flex flex-column gap-2",
}: {
  rows: { id: string; node: React.ReactNode }[];
  actions: BulkAction[];
  className?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  /** Удаление: подтверждение спрашивает общий ConfirmForm (модалка),
   *  сюда попадаем уже после «Удалить» — ошибка возвращается в модалку. */
  async function performDelete(
    action: Extract<BulkAction, { kind: "delete" }>,
  ): Promise<{ error?: string } | undefined> {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      await action.run(ids);
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Не получилось выполнить действие",
      };
    }
    setError(null);
    setSelected(new Set());
    router.refresh();
    return undefined;
  }

  function performSelect(action: Extract<BulkAction, { kind: "select" }>) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const value = values[action.label] ?? "";
    if (!value) {
      setError(`Выберите значение для «${action.label}»`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await action.run(ids, value);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Не получилось выполнить действие",
        );
      }
    });
  }

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-2">
        <label className="bulk-select-all small text-secondary d-inline-flex align-items-center gap-2">
          <input
            type="checkbox"
            className="form-check-input m-0"
            checked={allSelected}
            onChange={toggleAll}
          />
          Выбрать все на странице
        </label>
        {selected.size > 0 && (
          <span className="small text-secondary">
            · выбрано {selected.size}
          </span>
        )}
      </div>

      <div className={className}>
        {rows.map((row) => (
          <div
            key={row.id}
            className={`bulk-row ${selected.has(row.id) ? "is-selected" : ""}`}
          >
            <input
              type="checkbox"
              className="form-check-input bulk-row-check"
              checked={selected.has(row.id)}
              onChange={() => toggle(row.id)}
              aria-label="Выбрать запись"
            />
            <div className="flex-fill" style={{ minWidth: 0 }}>
              {row.node}
            </div>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="small text-white">Выбрано: {selected.size}</span>
          {actions.map((action) =>
            action.kind === "delete" ? (
              <ConfirmForm
                key={action.label}
                action={() => performDelete(action)}
                confirmMessage={action.confirmTemplate.replace(
                  "{n}",
                  String(selected.size),
                )}
                confirmLabel={action.label}
                busyLabel="Удаляем…"
                className="d-inline-flex"
              >
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  disabled={pending}
                >
                  {action.label}
                </button>
              </ConfirmForm>
            ) : (
              <span
                key={action.label}
                className="d-inline-flex align-items-center gap-2"
              >
                <select
                  className="form-select form-select-sm"
                  value={values[action.label] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [action.label]: e.target.value,
                    }))
                  }
                >
                  <option value="">{action.placeholder}</option>
                  {action.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => performSelect(action)}
                >
                  {action.label}
                </button>
              </span>
            ),
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSelected(new Set())}
          >
            Снять выделение
          </button>
          {error && <span className="small text-danger">{error}</span>}
          {pending && <span className="small text-secondary">Выполняем…</span>}
        </div>
      )}
    </>
  );
}
