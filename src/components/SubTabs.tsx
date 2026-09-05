"use client";

import { useState, type ReactNode } from "react";

/**
 * Под-табы внутри раздела страницы: вкладки профиля (сериалы по
 * статусам, события предстоящие/прошедшие) и лента фильмографии
 * артиста (сериалы/фильмы/шоу). Нарочно другой визуальный язык, чем у
 * основного ряда вкладок (правка владельца): маленькие pill-чипы
 * (.subtab-pill в globals.css), а не подчёркнутые tab-bar-item.
 *
 * Контент панелей приходит готовыми ReactNode с серверной страницы —
 * тот же паттерн, что у ProfileTabs; панели остаются смонтированными
 * через display:none, чтобы не терять состояние при переключении.
 */
export default function SubTabs({
  tabs,
  ariaLabel,
}: {
  tabs: { key: string; label: string; count?: number; content: ReactNode }[];
  ariaLabel?: string;
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  if (tabs.length === 0) return null;

  return (
    <div>
      <div className="subtab-bar" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            className={`subtab-pill${active === tab.key ? " active" : ""}`}
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
            {tab.count != null && <span className="subtab-pill-count">{tab.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.key} role="tabpanel" style={{ display: active === tab.key ? undefined : "none" }}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
