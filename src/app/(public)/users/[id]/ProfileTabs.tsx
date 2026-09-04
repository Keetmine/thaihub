"use client";

import { useState, type ReactNode } from "react";

export type ProfileTabKey =
  | "overview"
  | "stats"
  | "reviews"
  | "comments"
  | "dramas"
  | "events"
  | "trips"
  | "places"
  | "tickets";

/**
 * Правая колонка единого профиля: ряд вкладок + панели. Контент панелей
 * рендерит СЕРВЕРНАЯ страница и передаёт готовыми ReactNode — так
 * приватные данные зрителю не попадают даже в пропсы (их просто нет в
 * его наборе панелей), а клиенту остаётся только переключение.
 *
 * Панели остаются смонтированными (display:none), чтобы состояние
 * (раскрытые списки, карта) не терялось при переключении — тот же
 * паттерн, что был в кабинете. На узких экранах ряд вкладок скроллится
 * горизонтально (.profile-tab-row в globals.css).
 */
export default function ProfileTabs({
  initialTab,
  tabs,
}: {
  initialTab: ProfileTabKey;
  /** Только те вкладки, что положены этому зрителю, в порядке показа. */
  tabs: { key: ProfileTabKey; label: string; content: ReactNode }[];
}) {
  const firstKey = tabs[0]?.key ?? "overview";
  const validInitial = tabs.some((t) => t.key === initialTab) ? initialTab : firstKey;
  const [activeTab, setActiveTab] = useState<ProfileTabKey>(validInitial);
  const [prevInitialTab, setPrevInitialTab] = useState(validInitial);

  // initialTab приходит из ?tab= адреса. При мягкой навигации на уже
  // смонтированный профиль (клик по «Мои события» в меню) меняется
  // только проп — синхронизируем состояние прямо в рендере, как это
  // делал AccountTabs.
  if (validInitial !== prevInitialTab) {
    setPrevInitialTab(validInitial);
    setActiveTab(validInitial);
  }

  return (
    <div>
      <div className="tab-bar-row profile-tab-row">
        <div className="tab-bar">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab-bar-item ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {tabs.map((tab) => (
        <div key={tab.key} style={{ display: activeTab === tab.key ? undefined : "none" }}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
