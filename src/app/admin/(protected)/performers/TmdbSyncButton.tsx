"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncTmdbPerformers } from "./actions";
import type { PerformerSyncSummary } from "@/lib/tmdbImport";

export default function TmdbSyncButton() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PerformerSyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await syncTmdbPerformers();
      setResult(res);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить импорт");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={handleClick}
        disabled={isRunning}
      >
        {isRunning ? "Импорт…" : "Импортировать с TMDB"}
      </button>

      {isRunning && (
        <p className="small text-secondary mt-2 mb-0">
          Может занять несколько минут — проверяются все актёры в каталоге.
        </p>
      )}

      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}

      {result && !isRunning && (
        <div className="small text-secondary mt-2">
          <p className="mb-1">
            Проверено {result.total} актёров на TMDB. Синхронизировано —{" "}
            {result.synced}, не найдено — {result.notFound}
            {result.errors > 0 ? `, ошибок — ${result.errors}` : ""}.
          </p>
          <p className="mb-1">
            Сериалов: +{result.dramasCreated} новых, {result.dramasUpdated} обновлено, состав: +
            {result.castCreated} новых.
          </p>
          {result.notFoundNames.length > 0 && (
            <p className="mb-0">Не найдены: {result.notFoundNames.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
