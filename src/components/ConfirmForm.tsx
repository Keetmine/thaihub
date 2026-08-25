"use client";

import { useState } from "react";
import { useT } from "@/components/LocaleProvider";
import Modal from "./Modal";

export default function ConfirmForm({
  action,
  confirmMessage,
  className,
  confirmLabel,
  busyLabel,
  children,
}: {
  action: (formData: FormData) => void | Promise<void | { error?: string } | undefined>;
  confirmMessage: string;
  className?: string;
  /** Подпись кнопки. По умолчанию «Удалить» — обёртка родилась для
   *  удалений, но годится любому необратимому действию (например
   *  отвязке Telegram), где «Удалить» было бы неправдой. */
  confirmLabel?: string;
  busyLabel?: string;
  /** Кнопка-триггер. ОБЯЗАТЕЛЬНО с type="button" — обёртка перехватывает
   *  клик, но тип кнопки не переписывает (см. заметку ниже). */
  children: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      // Экшен может вернуть { error } — так серверные проверки
      // доносят причину до пользователя: текст брошенного исключения
      // Next в проде на клиент не передаёт (см. docs/architecture.md).
      const result = await action(new FormData());
      if (result && typeof result === "object" && "error" in result && result.error) {
        setError(String(result.error));
        return;
      }
      setOpen(false);
    } catch {
      setError(t.ui.actionFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Раньше onClick навешивался на children через cloneElement, но после
  // клиентской навигации элемент из RSC-потока приходит таким, что клон
  // молча теряет обработчик (на прямой загрузке работало — из-за этого
  // модалка «иногда» не открывалась). Обёртка с display:contents ловит
  // клик всегда и не влияет на разметку; preventDefault из предка
  // отменяет и сабмит, но children всё равно обязан быть type="button".
  return (
    <div className={className}>
      <span
        style={{ display: "contents" }}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </span>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title={t.ui.confirmTitle}
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
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? (busyLabel ?? t.ui.deleting)
              : (confirmLabel ?? t.common.delete)}
          </button>
        </div>
      </Modal>
    </div>
  );
}
