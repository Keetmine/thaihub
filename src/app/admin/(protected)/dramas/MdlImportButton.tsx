"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importFromMydramalist, type MdlImportSummary } from "./actions";

// Кнопка «подтянуть с MyDramaList» на странице редактирования сериала —
// тот же паттерн, что TmdbSyncButton. Ссылка берётся из поля
// mydramalistUrl формы (через DOM, чтобы не дублировать состояние).
export default function MdlImportButton({ dramaId }: { dramaId: string }) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<MdlImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const input = document.querySelector<HTMLInputElement>('input[name="mydramalistUrl"]');
    const url = input?.value ?? "";
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await importFromMydramalist(dramaId, url);
      setResult(res);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить импорт");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={handleClick}
        disabled={isRunning}
      >
        {isRunning ? "Импорт…" : "Подтянуть с MyDramaList"}
      </button>
      <p className="small text-secondary mt-1 mb-0">
        Заполняет пустые поля (описание, год, канал, постер) по ссылке из поля
        «MyDramaList» ниже и освежает статус. Занятые поля не трогает.
      </p>
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
      {result && !isRunning && (
        <p className="small text-secondary mt-2 mb-0">
          {result.filled.length > 0
            ? `Заполнено: ${result.filled.join(", ")}.`
            : "Новых данных нет."}
          {result.skipped.length > 0 && ` Уже было: ${result.skipped.join(", ")}.`}
        </p>
      )}
    </div>
  );
}
