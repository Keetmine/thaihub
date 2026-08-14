"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MergeGroupCard({
  title,
  rows,
  editHrefBase,
  onMerge,
}: {
  title: string;
  rows: { id: string; label: string; sublabel: string }[];
  editHrefBase: string;
  onMerge: (keeperId: string, loserIds: string[]) => Promise<void>;
}) {
  const router = useRouter();
  const [keeperId, setKeeperId] = useState(rows[0].id);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMerge() {
    const loserIds = rows.map((r) => r.id).filter((id) => id !== keeperId);
    if (
      !confirm(
        `Слить ${rows.length} записей «${title}» в одну? Остальные ${loserIds.length} будут удалены, их связи (события, избранное и т.п.) перенесутся на выбранную запись. Отменить нельзя.`,
      )
    ) {
      return;
    }
    setIsMerging(true);
    setError(null);
    try {
      await onMerge(keeperId, loserIds);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось слить записи");
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <div className="surface p-3">
      <p className="font-display fw-medium text-white mb-2">{title}</p>
      <div className="d-flex flex-column gap-2 mb-3">
        {rows.map((row) => (
          <label key={row.id} className="d-flex align-items-center gap-2">
            <input
              type="radio"
              name={`keeper-${title}`}
              checked={keeperId === row.id}
              onChange={() => setKeeperId(row.id)}
            />
            <span className="small">
              {row.label}{" "}
              <span className="text-secondary">— {row.sublabel}</span>{" "}
              <a href={`${editHrefBase}/${row.id}/edit`} target="_blank" className="link-secondary">
                открыть
              </a>
            </span>
          </label>
        ))}
      </div>
      {error && <p className="small text-danger mb-2">{error}</p>}
      <button
        type="button"
        className="btn btn-outline-warning btn-sm"
        onClick={handleMerge}
        disabled={isMerging}
      >
        {isMerging ? "Слияние…" : "Слить, оставив выбранную"}
      </button>
    </div>
  );
}
