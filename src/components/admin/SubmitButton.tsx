"use client";

import { useFormStatus } from "react-dom";

/** Кнопка отправки для админ-форм: пока server action выполняется,
 *  дизейблится и показывает busyLabel (или спиннер). До неё 35 submit-
 *  кнопок молчали, и «нажалось или нет?» решалось повторным кликом.
 *  useFormStatus работает только у ПОТОМКА <form action={…}> — кнопку
 *  нельзя выносить наружу или привязывать через атрибут form. */
export default function SubmitButton({
  label,
  busyLabel,
  className = "btn btn-primary btn-sm",
  disabled = false,
  formAction,
  onClick,
  title,
  ariaLabel,
}: {
  label: string;
  busyLabel?: string;
  className?: string;
  /** Внешний дизейбл (например, «импорт уже идёт») — складывается с pending. */
  disabled?: boolean;
  /** Для форм с несколькими submit-кнопками (formAction переопределяет action). */
  formAction?: (formData: FormData) => void | Promise<void>;
  /** Срабатывает ДО отправки — форма успевает узнать, какой кнопкой её
   *  отправили (например, какой раздел сохраняем). */
  onClick?: () => void;
  title?: string;
  /** Когда label — значок («✓»), скринридеру он ничего не говорит:
   *  здесь лежит человеческая подпись кнопки. */
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={pending || disabled}
      formAction={formAction}
      onClick={onClick}
      title={title ?? ariaLabel}
      aria-label={ariaLabel}
    >
      {pending ? (
        busyLabel ?? (
          <>
            <span
              className="spinner-border spinner-border-sm me-1"
              style={{ verticalAlign: "-0.125em" }}
              aria-hidden
            />
            {label}
          </>
        )
      ) : (
        label
      )}
    </button>
  );
}
