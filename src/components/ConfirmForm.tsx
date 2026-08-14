"use client";

import { cloneElement, isValidElement, useState } from "react";
import Modal from "./Modal";

export default function ConfirmForm({
  action,
  confirmMessage,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirmMessage: string;
  className?: string;
  children: React.ReactElement<{
    onClick?: (e: React.MouseEvent) => void;
    type?: string;
    disabled?: boolean;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      await action(new FormData());
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить действие");
    } finally {
      setIsSubmitting(false);
    }
  }

  const trigger = isValidElement(children)
    ? cloneElement(children, {
        type: "button",
        onClick: (e: React.MouseEvent) => {
          e.preventDefault();
          setOpen(true);
        },
      })
    : children;

  return (
    <div className={className}>
      {trigger}
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Подтверждение"
      >
        <p className="mb-3">{confirmMessage}</p>
        {error && <p className="text-danger small mb-3">{error}</p>}
        <div className="d-flex gap-2 justify-content-end">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Удаление…" : "Удалить"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
