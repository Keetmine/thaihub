"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  setDramaWatchStatus,
  clearDramaWatchStatus,
  type DramaWatchStatusValue,
} from "@/app/(public)/favorites/actions";
import { WATCH_STATUS_LABELS, WATCH_STATUS_ORDER } from "@/lib/watchStatus";

export default function WatchStatusSelect({
  dramaId,
  status,
}: {
  dramaId: string;
  status: DramaWatchStatusValue | null;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setIsSubmitting(true);
    try {
      if (value === "") {
        await clearDramaWatchStatus(dramaId);
      } else {
        await setDramaWatchStatus(dramaId, value as DramaWatchStatusValue);
      }
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <select
      className="form-select form-select-sm"
      style={{ width: "auto" }}
      value={status ?? ""}
      onChange={handleChange}
      disabled={isSubmitting}
    >
      <option value="">Не отмечено</option>
      {WATCH_STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {WATCH_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
