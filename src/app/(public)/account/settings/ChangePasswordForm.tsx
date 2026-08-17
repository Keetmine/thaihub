"use client";

import PasswordInput from "@/components/PasswordInput";
import { useState } from "react";
import { changePassword } from "../actions";

export default function ChangePasswordForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await changePassword(new FormData(e.currentTarget));
      setSuccess(true);
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить пароль");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
      <div>
        <label className="form-label">Текущий пароль</label>
        <PasswordInput name="currentPassword" required autoComplete="current-password" />
      </div>
      <div>
        <label className="form-label">Новый пароль</label>
        <PasswordInput name="newPassword" required minLength={6} autoComplete="new-password" />
      </div>
      <div>
        <label className="form-label">Повторите новый пароль</label>
        <PasswordInput name="confirmPassword" required minLength={6} autoComplete="new-password" />
      </div>
      {error && <p className="small text-danger mb-0">{error}</p>}
      {success && <p className="small text-success mb-0">Пароль изменён.</p>}
      <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? "Сохранение…" : "Сменить пароль"}
      </button>
    </form>
  );
}
