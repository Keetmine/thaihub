"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocaleHref, useT } from "@/components/LocaleProvider";
import { saveProfileSetup } from "./actions";
import DatePickerInput from "@/components/DatePickerInput";

/**
 * Первый шаг после регистрации: ник и, по желанию, остальное о себе.
 * Ник предзаполнен (из Telegram или почты) — так человек не застревает
 * на форме, но может поменять его прямо здесь.
 */
export default function ProfileSetupForm({
  suggestedUsername,
  defaultName,
  countries,
}: {
  suggestedUsername: string;
  defaultName: string;
  /** Список стран считает СЕРВЕР и передаёт готовым. Своими силами
   *  (countryOptions(locale) прямо здесь) форма разъезжалась при
   *  гидрации: и названия стран, и порядок сортировки берутся из ICU, а
   *  у Node и браузера версии ICU разные — React ругался «server
   *  rendered text didn't match the client» и перерисовывал форму. Та
   *  же причина, по которой у нас свои таблицы месяцев в lib/dates.ts. */
  countries: { code: string; label: string }[];
}) {
  const router = useRouter();
  const t = useT();
  const localeHref = useLocaleHref();
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
      // Дальше — шаг «перенесите список с MyDramaList» (welcome/import),
      // потом выбор артистов на /welcome.
      router.push(localeHref("/welcome/import"));
    } catch {
      setError(t.auth.profileSetup.saveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form action={handleSubmit} className="surface p-4 d-flex flex-column gap-3">
      <div>
        <label className="form-label" htmlFor="profile-setup-form-username">{t.auth.profileSetup.usernameLabel}</label>
        <div className="input-group">
          <span className="input-group-text small text-secondary">myblhub.com/users/</span>
          <input id="profile-setup-form-username"
            name="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            className="form-control"
            autoFocus
          />
        </div>
        <p className="small text-secondary mt-1 mb-0">{t.auth.profileSetup.usernameHint}</p>
      </div>

      <div className="row g-3">
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="profile-setup-form-name">{t.auth.profileSetup.nameLabel}</label>
          <input id="profile-setup-form-name"
            name="name"
            defaultValue={defaultName}
            placeholder={t.auth.profileSetup.namePlaceholder}
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="profile-setup-form-country">{t.auth.profileSetup.countryLabel}</label>
          <select id="profile-setup-form-country" name="country" defaultValue="" className="form-select">
            <option value="">{t.auth.profileSetup.countryEmpty}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="profile-setup-form-gender">{t.auth.profileSetup.genderLabel}</label>
          <select id="profile-setup-form-gender" name="gender" defaultValue="" className="form-select">
            <option value="">{t.auth.profileSetup.genderEmpty}</option>
            <option value="female">{t.auth.profileSetup.genderFemale}</option>
            <option value="male">{t.auth.profileSetup.genderMale}</option>
            <option value="other">{t.auth.profileSetup.genderOther}</option>
          </select>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="profile-setup-form-birthDate">{t.auth.profileSetup.birthLabel}</label>
          <DatePickerInput id="profile-setup-form-birthDate" name="birthDate" yearsBack={100} yearsForward={0} />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="profile-setup-form-bio">{t.auth.profileSetup.bioLabel}</label>
          <textarea id="profile-setup-form-bio"
            name="bio"
            rows={3}
            placeholder={t.auth.profileSetup.bioPlaceholder}
            className="form-control"
          />
        </div>
      </div>

      {error && <p className="small text-danger mb-0">{error}</p>}

      <div className="d-flex flex-wrap align-items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? t.auth.profileSetup.saving : t.auth.profileSetup.submit}
        </button>
        <span className="small text-secondary">{t.auth.profileSetup.laterHint}</span>
      </div>
    </form>
  );
}
