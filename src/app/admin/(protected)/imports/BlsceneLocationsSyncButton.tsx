"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncBlsceneLocations } from "../locations/actions";
import type { BlsceneLocationRefreshResult } from "@/lib/blsceneImport";

export default function BlsceneLocationsSyncButton() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BlsceneLocationRefreshResult | null>(null);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setStopped(false);
    try {
      // null — прогон остановили кнопкой в журнале импортов.
      const res = await syncBlsceneLocations();
      setResult(res);
      setStopped(res === null);
      router.refresh();
    } catch {
      setError("Проверка не запустилась — посмотрите /admin/errors.");
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
        {isRunning ? "Проверяем…" : "Проверить актуальный список"}
      </button>

      {isRunning && (
        <p className="small text-secondary mt-2 mb-0">
          Идёт обход страниц — это несколько минут. Можно уйти со страницы,
          проверка не прервётся.
        </p>
      )}

      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}

      {stopped && !isRunning && (
        <p className="small text-secondary mt-2 mb-0">
          Проверка остановлена. Найденное до остановки уже сохранено — можно
          запустить снова, повторы не создаются.
        </p>
      )}

      {result && !isRunning && (
        <div className="small text-secondary mt-2">
          <p className="mb-1">Проверено {result.checked} сериалов на blscene.</p>
          {result.refreshed.length > 0 && (
            <ul className="mb-1 ps-3">
              {result.refreshed.map((d) => (
                <li key={d.title}>
                  {d.title} — +{d.newLocations} локаций
                </li>
              ))}
            </ul>
          )}
          {result.errors.length > 0 && (
            <ul className="mb-0 ps-3 text-danger">
              {result.errors.map((e) => (
                <li key={e.title}>
                  {e.title}: {e.message}
                </li>
              ))}
            </ul>
          )}
          {result.refreshed.length === 0 && result.errors.length === 0 && (
            <p className="mb-0">Новых локаций не найдено.</p>
          )}
        </div>
      )}
    </div>
  );
}
