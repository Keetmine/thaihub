"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncBlsceneLocations } from "./actions";
import type { BlsceneLocationRefreshResult } from "@/lib/blsceneImport";

export default function BlsceneLocationsSyncButton() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BlsceneLocationRefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await syncBlsceneLocations();
      setResult(res);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить проверку");
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
        {isRunning ? "Проверка…" : "Проверить актуальный список (blscene)"}
      </button>

      {isRunning && (
        <p className="small text-secondary mt-2 mb-0">
          Может занять несколько минут — проверяются страницы всех уже импортированных сериалов
          на предмет новых локаций.
        </p>
      )}

      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}

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
