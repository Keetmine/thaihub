"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmForm from "@/components/ConfirmForm";

export default function MergeGroupCard({
  title,
  rows,
  editHrefBase,
  onMerge,
  onDismiss,
  dismissLabel,
}: {
  title: string;
  rows: { id: string; label: string; sublabel: string }[];
  editHrefBase: string;
  onMerge: (keeperId: string, loserIds: string[]) => Promise<void>;
  /** И5: «не сливать» / «вернуть в дубли». Обратимо — без модалки. */
  onDismiss?: () => Promise<void>;
  dismissLabel?: string;
}) {
  const router = useRouter();
  const [keeperId, setKeeperId] = useState(rows[0].id);
  const [isDismissing, setIsDismissing] = useState(false);

  // Подтверждение и индикация «Слияние…» — у общего ConfirmForm (модалка);
  // ошибка сервера тоже показывается в ней (вернуть { error }).
  async function confirmedMerge(): Promise<{ error?: string } | undefined> {
    const loserIds = rows.map((r) => r.id).filter((id) => id !== keeperId);
    try {
      await onMerge(keeperId, loserIds);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Не удалось слить записи" };
    }
    router.refresh();
    return undefined;
  }

  const loserCount = rows.length - 1;

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
      <div className="d-flex flex-wrap align-items-center gap-2">
        <ConfirmForm
          action={confirmedMerge}
          confirmMessage={`Слить ${rows.length} записей «${title}» в одну? Остальные ${loserCount} будут удалены, их связи (события, избранное и т.п.) перенесутся на выбранную запись. Отменить нельзя.`}
          confirmLabel="Слить"
          busyLabel="Слияние…"
          className="d-inline"
        >
          <button type="button" className="btn btn-outline-warning btn-sm">
            Слить, оставив выбранную
          </button>
        </ConfirmForm>
        {onDismiss && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={isDismissing}
            onClick={async () => {
              setIsDismissing(true);
              try {
                await onDismiss();
                router.refresh();
              } finally {
                setIsDismissing(false);
              }
            }}
          >
            {isDismissing ? "…" : dismissLabel}
          </button>
        )}
      </div>
    </div>
  );
}
