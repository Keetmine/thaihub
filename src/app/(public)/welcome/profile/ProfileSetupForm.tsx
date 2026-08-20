"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES } from "@/lib/countries";
import { saveProfileSetup } from "./actions";

/**
 * Первый шаг после регистрации: ник и, по желанию, остальное о себе.
 * Ник предзаполнен (из Telegram или почты) — так человек не застревает
 * на форме, но может поменять его прямо здесь.
 */
export default function ProfileSetupForm({
  suggestedUsername,
  defaultName,
}: {
  suggestedUsername: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [username, setUsername] = useState(suggestedUsername);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveProfileSetup(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/welcome");
    } catch {
      setError("Не удалось сохранить — попробуйте ещё раз");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form action={handleSubmit} className="surface p-4 d-flex flex-column gap-3">
      <div>
        <label className="form-label">Ник *</label>
        <div className="input-group">
          <span className="input-group-text small text-secondary">myblhub.com/users/</span>
          <input
            name="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            className="form-control"
            autoFocus
          />
        </div>
        <p className="small text-secondary mt-1 mb-0">
          По этой ссылке вас найдут друзья. Латиница, цифры, точка, дефис или
          подчёркивание.
        </p>
      </div>

      <div className="row g-3">
        <div className="col-12 col-md-6">
          <label className="form-label">Имя</label>
          <input
            name="name"
            defaultValue={defaultName}
            placeholder="Как показывать вас на сайте"
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Страна</label>
          <select name="country" defaultValue="" className="form-select">
            <option value="">не указана</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Пол</label>
          <select name="gender" defaultValue="" className="form-select">
            <option value="">не указан</option>
            <option value="female">женский</option>
            <option value="male">мужской</option>
            <option value="other">другой</option>
          </select>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Дата рождения</label>
          <input type="date" name="birthDate" className="form-control" />
        </div>
        <div className="col-12">
          <label className="form-label">О себе</label>
          <textarea
            name="bio"
            rows={3}
            placeholder="Любимые пейринги, на скольких концертах были, что ищете здесь"
            className="form-control"
          />
        </div>
      </div>

      {error && <p className="small text-danger mb-0">{error}</p>}

      <div className="d-flex flex-wrap align-items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Сохраняем…" : "Продолжить"}
        </button>
        <span className="small text-secondary">
          Кроме ника всё можно заполнить позже в настройках.
        </span>
      </div>
    </form>
  );
}
