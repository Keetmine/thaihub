"use client";

import { useState } from "react";

/** Глаз в иконочном стиле остальных иконок (stroke, currentColor). */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

/** Поле пароля с глазиком показать/скрыть. Обычный name= для серверных
 *  форм — состояние только у типа инпута. */
export default function PasswordInput({
  name,
  required = false,
  minLength,
  autoComplete,
  className = "",
}: {
  name: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`position-relative ${className}`}>
      <input
        type={visible ? "text" : "password"}
        name={name}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="form-control"
        style={{ paddingRight: "2.75rem" }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        title={visible ? "Скрыть пароль" : "Показать пароль"}
        className="btn p-0 border-0 position-absolute top-50 translate-middle-y text-secondary d-inline-flex align-items-center"
        style={{ right: "0.85rem", background: "none" }}
      >
        <EyeIcon off={visible} />
      </button>
    </div>
  );
}
