"use client";

import { useState, type ReactNode } from "react";

/**
 * Две-три вкладки над формой записи в админке: «Запись», «Перевод»,
 * «История». Заведено, чтобы блок перевода везде выглядел одинаково
 * (правка владельца 2026-09-10: «вынесем в новый таб, чтоб всё было в
 * одном стиле») — у формы исполнителя вкладки были свои, у остальных
 * форм их не было вовсе, и перевод болтался внизу страницы.
 *
 * Обёртка НИЧЕГО не знает о содержимом: панели приходят готовой
 * разметкой и рендерятся на сервере. Поэтому большие серверные формы
 * (сериал, событие) остаются серверными — клиентский здесь только
 * переключатель.
 *
 * Скрытая панель остаётся В РАЗМЕТКЕ (`hidden`), а не размонтируется:
 * иначе набранное в форме пропадало бы при взгляде на перевод, а у
 * формы записи нет черновика.
 */
export default function EntityTabs({
  tabs,
}: {
  tabs: { key: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  return (
    <div>
      {/* role=tablist/tab, а не голые кнопки: aria-selected живёт
          только на роли tab, и скринридер объявляет «вкладка 2 из 3». */}
      <div className="tab-bar-row mb-3">
        <div className="tab-bar" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-controls={`panel-${tab.key}`}
              aria-selected={tab.key === active}
              className={`tab-bar-item ${tab.key === active ? "active" : ""}`}
              onClick={() => setActive(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          id={`panel-${tab.key}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.key}`}
          hidden={tab.key !== active}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
