"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelImportRun } from "./cancelActions";

/**
 * «Остановить» у идущего импорта. Прогон не обрывается на полуслове:
 * экшен поднимает флаг, а импорт замечает его на следующем элементе и
 * выходит сам — поэтому после клика кнопка ждёт («Останавливаем…»), а
 * не рапортует об остановке сразу. Уже импортированное остаётся.
 */
export default function StopImportButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = pending || requested;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await cancelImportRun(runId);
      if (result.ok) {
        setRequested(true);
        // Статус на странице обновляет и RunningImportsWatcher, но
        // ждать его четыре секунды после клика незачем.
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <span className="d-inline-flex flex-column align-items-start gap-1">
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        onClick={handleClick}
        disabled={busy}
        title="Импорт остановится после текущего элемента — уже импортированное останется в каталоге"
      >
        {busy ? "Останавливаем…" : "Остановить"}
      </button>
      {requested && (
        <span className="small text-secondary">
          Остановим после текущего элемента.
        </span>
      )}
      {error && <span className="small text-danger">{error}</span>}
    </span>
  );
}
