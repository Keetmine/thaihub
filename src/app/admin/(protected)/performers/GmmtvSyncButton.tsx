"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncGmmtv } from "./actions";
import type { GmmtvSyncResult } from "@/lib/gmmtvImport";

export default function GmmtvSyncButton() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<GmmtvSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await syncGmmtv();
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
        {isRunning ? "Проверка…" : "Проверить GMMTV"}
      </button>

      {isRunning && (
        <p className="small text-secondary mt-2 mb-0">
          Может занять несколько минут — проверяется весь состав GMMTV.
        </p>
      )}

      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}

      {result && !isRunning && (
        <div className="small text-secondary mt-2">
          <p className="mb-1">
            Проверено {result.checked} артистов на GMMTV. Новых — {result.created.length}, обновлено —{" "}
            {result.updated.length}.
          </p>
          {result.created.length > 0 && (
            <p className="mb-1">Новые: {result.created.join(", ")}</p>
          )}
          {result.errors.length > 0 && (
            <ul className="mb-0 ps-3 text-danger">
              {result.errors.map((e) => (
                <li key={e.id}>
                  id {e.id}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
