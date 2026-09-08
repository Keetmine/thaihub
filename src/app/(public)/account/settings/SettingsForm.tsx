"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/components/LocaleProvider";

// Подпись кнопки, флаг «сохранено» и ошибка — через контекст: ряд
// сабмита может стоять не сразу под children формы, а внутри последней
// карточки (форма профиля обнимает две карточки-секции). Там же
// «файл ещё едет»: сабмит на это время закрыт (см. ниже).
const SubmitContext = createContext<{
  label: string;
  saved: boolean;
  error: string | null;
  uploading: boolean;
}>({
  label: "",
  saved: false,
  error: null,
  uploading: false,
});

/** Куда дропзона сообщает «занята/свободна». Отдельным контекстом от
 *  SubmitContext: тот читают, этот пишут, и подписчики у них разные. */
const UploadingContext = createContext<(busy: boolean) => void>(() => {});

/** Для клиентских полей загрузки внутри формы настроек
 *  (SettingsUploadField): страница-то серверная, свой колбэк она
 *  дропзоне передать не может. */
export function useSettingsUploading(): (busy: boolean) => void {
  return useContext(UploadingContext);
}

/** Ряд «Сохранить» + подтверждение. useFormStatus работает только
 *  ВНУТРИ формы — поэтому отдельный компонент. */
export function SettingsSubmitRow({ className }: { className?: string }) {
  const t = useT();
  const { label, saved, error, uploading } = useContext(SubmitContext);
  const { pending } = useFormStatus();
  return (
    <div className={`d-flex align-items-center gap-3 ${className ?? ""}`}>
      {/* Пока картинка едет, поле дропзоны пустое, и сохранение стёрло
          бы прежнее фото/обложку — молча, без единой ошибки (та же
          грабля, что чинили в формах сообществ). */}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending || uploading}>
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
  // Счётчик, а не флаг: полей загрузки в форме бывает несколько (фото и
  // обложка профиля), и «свободна» от одного не должно открывать сабмит,
  // пока едет другое.
  const [uploads, setUploads] = useState(0);
  const markUploading = useCallback(
    (busy: boolean) => setUploads((n) => Math.max(0, n + (busy ? 1 : -1))),
    [],
  );
  const uploading = uploads > 0;
  return (
    <SubmitContext.Provider value={{ label: submitLabel, saved, error, uploading }}>
      <UploadingContext.Provider value={markUploading}>
        <form
          className={className}
          action={async (formData) => {
            // Кнопка на это время выключена, но форму отправляет и Enter
            // в текстовом поле — вторая калитка здесь не лишняя.
            if (uploading) return;
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
      </UploadingContext.Provider>
    </SubmitContext.Provider>
  );
}
