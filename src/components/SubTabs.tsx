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
  variant = "pills",
}: {
  tabs: { key: string; label: string; count?: number; content: ReactNode }[];
  ariaLabel?: string;
  /** «pills» — чипы профиля; «bar» — стандартные подчёркнутые вкладки
   *  сайта (.tab-bar, как на /events), счётчик в скобках. Фильмография
   *  артиста — bar (правка владельца: табы как на событиях). */
  variant?: "pills" | "bar";
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  if (tabs.length === 0) return null;

  const bar = variant === "bar";

  return (
    <div>
      <div
        className={bar ? "tab-bar mb-3" : "subtab-bar"}
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            className={
              bar
                ? `tab-bar-item${active === tab.key ? " active" : ""}`
                : `subtab-pill${active === tab.key ? " active" : ""}`
            }
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
            {tab.count != null &&
              (bar ? (
                <> ({tab.count})</>
              ) : (
                <span className="subtab-pill-count">{tab.count}</span>
              ))}
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
