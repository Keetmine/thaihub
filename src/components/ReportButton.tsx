"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { submitReport } from "@/app/(public)/feedbackActions";

// «Пожаловаться» на пользовательский контент (список мест, профиль…) —
// жалобы попадают в очередь /admin/moderation.
export default function ReportButton({
  targetType,
  targetId,
  className,
}: {
  targetType: "placeList" | "profile" | "eventNote" | "comment" | "review";
  targetId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setPending(true);
    setError(null);
    try {
      await submitReport(targetType, targetId, reason);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить");
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
        Пожаловаться
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setDone(false);
          setReason("");
        }}
        title="Пожаловаться"
      >
        {done ? (
          <p className="small text-success mb-0">
            ✓ Жалоба отправлена — модераторы посмотрят.
          </p>
        ) : (
          <div className="d-flex flex-column gap-3">
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Что не так с этим контентом? (необязательно)"
              aria-label="Что не так с этим контентом"
              className="form-control"
            />
            {error && <p className="small text-danger mb-0">{error}</p>}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={send}
              disabled={pending}
            >
              {pending ? "Отправка…" : "Отправить жалобу"}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
