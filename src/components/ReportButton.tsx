"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/components/LocaleProvider";
import { submitReport } from "@/app/(public)/feedbackActions";
import type { ReportTargetType } from "@/lib/reports";

// «Пожаловаться» на пользовательский контент (список мест, профиль…) —
// жалобы попадают в очередь /admin/moderation.
export default function ReportButton({
  targetType,
  targetId,
  className,
}: {
  // Сообщества (АА25): жалоба принимается и на тему (communityPost), и
  // на само сообщество, его встречу и его ссылку. Содержимое сообщества
  // модерируют его хозяева, но проблемой бывает сообщество целиком —
  // тогда разбирается админ сайта. Полный список типов и подписи —
  // REPORT_TARGET_LABELS в src/lib/reports.ts.
  targetType: ReportTargetType;
  targetId: string;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setPending(true);
    setError(null);
    try {
      // Экшен возвращает ошибку значением (текст исключения в проде до
      // клиента не доезжает); catch остаётся на сетевые сбои и лимитер.
      const result = await submitReport(targetType, targetId, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.ui.reportFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn-link btn-sm text-secondary p-0 ${className ?? ""}`}
        onClick={() => setOpen(true)}
      >
        {t.ui.report}
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setDone(false);
          setReason("");
        }}
        title={t.ui.report}
      >
        {done ? (
          <p className="small text-success mb-0">✓ {t.ui.reportSent}</p>
        ) : (
          <div className="d-flex flex-column gap-3">
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.ui.reportPlaceholder}
              aria-label={t.ui.reportLabel}
              className="form-control"
            />
            {error && <p className="small text-danger mb-0">{error}</p>}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={send}
              disabled={pending}
            >
              {pending ? t.ui.reportSending : t.ui.reportSubmit}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
