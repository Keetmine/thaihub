"use client";

import { createContext, useContext, useState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/components/LocaleProvider";

// Подпись кнопки, флаг «сохранено» и ошибка — через контекст: ряд
// сабмита может стоять не сразу под children формы, а внутри последней
// карточки (форма профиля обнимает две карточки-секции).
const SubmitContext = createContext<{ label: string; saved: boolean; error: string | null }>({
  label: "",
  saved: false,
  error: null,
});

/** Ряд «Сохранить» + подтверждение. useFormStatus работает только
 *  ВНУТРИ формы — поэтому отдельный компонент. */
export function SettingsSubmitRow({ className }: { className?: string }) {
  const t = useT();
  const { label, saved, error } = useContext(SubmitContext);
  const { pending } = useFormStatus();
  return (
    <div className={`d-flex align-items-center gap-3 ${className ?? ""}`}>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? t.settings.saving : label}
      </button>
      {/* role=status: скринридер объявляет подтверждение сам. Во время
          следующей отправки надпись гаснет, чтобы не врать. */}
      {saved && !pending && (
        <span className="small text-success" role="status">
          {t.settings.saved}
        </span>
      )}
      {/* Ошибка экшена (значением, см. account/actions.ts) — тем же
          рядом, где человек ждёт «Сохранено». */}
      {error && !pending && (
        <span className="small text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Форма настроек с внятным подтверждением сохранения: голый
 * `<form action>` молчит об успехе, и «нажал — вроде ничего не
 * произошло» читалось как поломка. Экшен остаётся прежним server
 * action (контракт не меняется); если он делает redirect (смена языка),
 * навигация происходит сама и надпись просто не успевает показаться.
 *
 * По умолчанию ряд сабмита рисуется под children; ownSubmitRow=true
 * выключает его — тогда страница ставит <SettingsSubmitRow /> сама,
 * внутри нужной карточки.
 */
export default function SettingsForm({
  action,
  submitLabel,
  className,
  ownSubmitRow = false,
  children,
}: {
  /** Экшен может вернуть ошибку значением `{ ok: false, error }` —
   *  текст исключения в проде до клиента не доезжает. */
  action: (formData: FormData) => Promise<void | { ok: false; error: string }>;
  submitLabel: string;
  className?: string;
  ownSubmitRow?: boolean;
  children: React.ReactNode;
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SubmitContext.Provider value={{ label: submitLabel, saved, error }}>
      <form
        className={className}
        action={async (formData) => {
          setSaved(false);
          setError(null);
          const result = await action(formData);
          if (result && !result.ok) {
            setError(result.error);
            return;
          }
          setSaved(true);
        }}
      >
        {children}
        {!ownSubmitRow && <SettingsSubmitRow className="mt-3" />}
      </form>
    </SubmitContext.Provider>
  );
}
