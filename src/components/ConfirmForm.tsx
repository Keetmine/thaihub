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

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      await action(new FormData());
    } finally {
      setIsSubmitting(false);
      setOpen(false);
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
      <Modal open={open} onClose={() => setOpen(false)} title="Подтверждение">
        <p className="mb-3">{confirmMessage}</p>
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
