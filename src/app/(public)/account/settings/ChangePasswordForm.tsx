"use client";

import PasswordInput from "@/components/PasswordInput";
import { useState } from "react";
import { useT } from "@/components/LocaleProvider";
import { changePassword } from "../actions";

export default function ChangePasswordForm() {
  const t = useT();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // currentTarget после await обнуляется — берём ссылку заранее.
    const form = e.currentTarget;
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      // Ошибка приходит значением ({ ok: false, error }): текст
      // брошенного исключения Next в проде на клиент не передаёт.
      const result = await changePassword(new FormData(form));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      form.reset();
    } catch {
      setError(t.account.settings.passwordFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
      <div>
        <label className="form-label">{t.account.settings.currentPassword}</label>
        <PasswordInput name="currentPassword" required autoComplete="current-password" />
      </div>
      <div>
        <label className="form-label">{t.account.settings.newPassword}</label>
        <PasswordInput name="newPassword" required minLength={6} autoComplete="new-password" />
      </div>
      <div>
        <label className="form-label">{t.account.settings.repeatPassword}</label>
        <PasswordInput name="confirmPassword" required minLength={6} autoComplete="new-password" />
      </div>
      {error && <p className="small text-danger mb-0">{error}</p>}
      {success && (
        <p className="small text-success mb-0">{t.account.settings.passwordChanged}</p>
      )}
      <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? t.account.settings.passwordSaving : t.account.settings.passwordSubmit}
      </button>
    </form>
  );
}
