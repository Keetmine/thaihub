"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncTmdbDramas } from "./actions";
import type { DramaSyncSummary } from "@/lib/tmdbImport";

export default function TmdbSyncButton() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DramaSyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await syncTmdbDramas();
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
          Может занять несколько минут — проверяются все сериалы в каталоге.
        </p>
      )}

      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}

      {result && !isRunning && (
        <div className="small text-secondary mt-2">
          <p className="mb-1">
            Проверено {result.total} сериалов на TMDB. Создано — {result.created}, обновлено —{" "}
            {result.updated}, не найдено — {result.notFound}
            {result.conflicts > 0 ? `, конфликтов — ${result.conflicts}` : ""}
            {result.errors > 0 ? `, ошибок — ${result.errors}` : ""}.
          </p>
          <p className="mb-1">Состав: +{result.castCreated} новых.</p>
          {result.notFoundTitles.length > 0 && (
            <p className="mb-1">Не найдены: {result.notFoundTitles.join(", ")}</p>
          )}
          {result.conflictTitles.length > 0 && (
            <p className="mb-0 text-danger">{result.conflictTitles.join("; ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
