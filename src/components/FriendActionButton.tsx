"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/LocaleProvider";

export default function FriendActionButton({
  action,
  id,
  label,
  pendingLabel,
  className,
}: {
  /** Server action; ошибку может вернуть значением `{ ok: false, error }`
   *  (текст исключения в проде до клиента не доезжает). */
  action: (id: string) => Promise<void | { ok: false; error: string }>;
  id: string;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await action(id);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError(t.ui.actionFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="d-inline-flex flex-column align-items-start gap-1">
      <button
        type="button"
        className={className ?? "btn btn-primary btn-sm"}
        onClick={handleClick}
        disabled={isSubmitting}
      >
        {isSubmitting ? (pendingLabel ?? "…") : label}
      </button>
      {error && <span className="small text-danger">{error}</span>}
    </div>
  );
}
