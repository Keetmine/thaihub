"use client";

import { useState } from "react";
import { useT } from "@/components/LocaleProvider";

// Вкладки настроек: контент шире не нужен, но пустой правой половины
// больше нет — вкладки + две колонки внутри разделов, где уместно.
type Tab = "profile" | "privacy" | "security" | "calendar";

export default function SettingsTabs({
  profile,
  privacy,
  security,
  calendar,
}: {
  profile: React.ReactNode;
  privacy: React.ReactNode;
  security: React.ReactNode;
  calendar: React.ReactNode;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("profile");

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: t.account.settings.tabProfile },
    { id: "privacy", label: t.account.settings.tabPrivacy },
    // «Безопасность», а не «Пароль»: тут же живёт удаление аккаунта, и
    // подсказки на странице уже ссылались на вкладку по этому имени.
    { id: "security", label: t.account.settings.tabSecurity },
    { id: "calendar", label: t.account.settings.tabCalendar },
  ];

  return (
    <div>
      <div className="tab-bar mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-bar-item ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Все вкладки смонтированы (display:none) — формы не теряют
          состояние при переключении. */}
      <div style={{ display: tab === "profile" ? undefined : "none" }}>{profile}</div>
      <div style={{ display: tab === "privacy" ? undefined : "none" }}>{privacy}</div>
      <div style={{ display: tab === "security" ? undefined : "none" }}>{security}</div>
      <div style={{ display: tab === "calendar" ? undefined : "none" }}>{calendar}</div>
    </div>
  );
}
