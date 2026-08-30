"use client";

import { useState } from "react";
import PasswordInput from "@/components/PasswordInput";
import { useT } from "@/components/LocaleProvider";
import { resetPassword } from "../actions";

/** Клиентская обёртка формы: экшен возвращает ошибку значением (текст
 *  исключения в проде до клиента не доезжает), а голому `<form action>`
 *  результат некуда деть — показываем его здесь. Успех делает redirect
 *  на сервере, обрабатывать его не нужно. */
export default function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        setError(null);
        const result = await resetPassword(token, formData);
        if (result && !result.ok) setError(result.error);
      }}
    >
      <label className="form-label" htmlFor="token-password">{t.auth.reset.passwordLabel}</label>
      <PasswordInput
        id="token-password"
        name="password"
        required
        minLength={6}
        autoComplete="new-password"
        className="mb-3"
      />
      {error && <p className="small text-danger">{error}</p>}
      <button type="submit" className="btn btn-primary w-100">
        {t.auth.reset.submit}
      </button>
    </form>
  );
}
