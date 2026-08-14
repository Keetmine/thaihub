"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncBlsceneDramas } from "./actions";
import type { BlsceneSyncResult } from "@/lib/blsceneImport";

export default function BlsceneSyncButton() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BlsceneSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await syncBlsceneDramas();
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
          Может занять время — для каждого нового сериала подтягиваются локации и координаты.
        </p>
      )}

      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}

      {result && !isRunning && (
        <div className="small text-secondary mt-2">
          <p className="mb-1">
            Проверено {result.checked} сериалов на blscene, новых —{" "}
            {result.imported.length + result.errors.length}.
          </p>
          {result.imported.length > 0 && (
            <ul className="mb-1 ps-3">
              {result.imported.map((d) => (
                <li key={d.title}>
                  {d.title} — {d.locationsImported} локаций ({d.locationsWithCoords} с координатами)
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
          {result.imported.length === 0 && result.errors.length === 0 && (
            <p className="mb-0">Новых сериалов не найдено — всё уже есть.</p>
          )}
        </div>
      )}
    </div>
  );
}
