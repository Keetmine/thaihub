"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import ScrollableTabs from "@/components/ScrollableTabs";

/** Порядок — как в ряду (решение владельца 2026-09-08), см. VALID_TABS. */
export type ProfileTabKey =
  | "overview"
  | "stats"
  | "dramas"
  | "events"
  | "communities"
  | "trips"
  | "places"
  | "tickets"
  | "reviews"
  | "comments";

/**
 * Правая колонка единого профиля: ряд вкладок + панели. Контент панелей
 * рендерит СЕРВЕРНАЯ страница и передаёт готовыми ReactNode — так
 * приватные данные зрителю не попадают даже в пропсы (их просто нет в
 * его наборе панелей), а клиенту остаётся только переключение.
 *
 * Панели остаются смонтированными (display:none), чтобы состояние
 * (раскрытые списки, карта) не терялось при переключении — тот же
 * паттерн, что был в кабинете.
 *
 * Прокрутку ряда (вкладок десять, и на 1280 последние обрезались краем
 * колонки — жалоба владельца 2026-09-08) держит общий `ScrollableTabs`:
 * растушёванные края, кнопки «влево/вправо» и подтягивание активной
 * вкладки в видимую часть живут там. Здесь остаётся только то, что
 * своё, — какие вкладки есть и какая открыта.
 *
 * Вкладки — НАСТОЯЩИЕ ссылки на `?tab=…` (просьба владельца
 * 2026-09-06: «хочу скинуть ссылку на сериалы в профиле»). Обычный клик
 * мы перехватываем и правим адрес через history.pushState: страницу
 * перерисовывать незачем, панели уже смонтированы, — зато адресная
 * строка показывает открытую вкладку, её можно скопировать, а «назад»
 * возвращает к предыдущей. Ctrl/⌘-клик и средняя кнопка работают сами
 * собой, потому что это ссылка, а не кнопка.
 */
export default function ProfileTabs({
  initialTab,
  tabs,
}: {
  initialTab: ProfileTabKey;
  /** Только те вкладки, что положены этому зрителю, в порядке показа. */
  tabs: { key: ProfileTabKey; label: string; content: ReactNode }[];
}) {
  const pathname = usePathname();
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

  // «Назад» после переключения вкладок: адрес меняли мимо роутера, и
  // сам он о нём не узнает — слушаем popstate и подхватываем вкладку из
  // адреса. Без этого кнопка «назад» меняла бы адрес, оставляя открытой
  // прежнюю вкладку.
  useEffect(() => {
    function syncFromUrl() {
      const fromUrl = new URLSearchParams(window.location.search).get("tab");
      const next = tabs.find((t) => t.key === fromUrl)?.key ?? firstKey;
      setActiveTab(next);
    }
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [firstKey, tabs]);

  return (
    <div>
      <div className="tab-bar-row">
        <ScrollableTabs activeKey={activeTab} dense>
          {tabs.map((tab) => (
            <a
              key={tab.key}
              // Первая вкладка — это сам профиль без параметра: адрес
              // /users/keetmine должен оставаться чистым.
              href={tab.key === firstKey ? pathname : `${pathname}?tab=${tab.key}`}
              className={`tab-bar-item ${activeTab === tab.key ? "active" : ""}`}
              aria-current={activeTab === tab.key ? "page" : undefined}
              onClick={(e) => {
                // Открыть в новой вкладке — пусть браузер делает своё.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                setActiveTab(tab.key);
                window.history.pushState(
                  null,
                  "",
                  tab.key === firstKey ? pathname : `${pathname}?tab=${tab.key}`,
                );
              }}
            >
              {tab.label}
            </a>
          ))}
        </ScrollableTabs>
      </div>

      {tabs.map((tab) => (
        <div key={tab.key} style={{ display: activeTab === tab.key ? undefined : "none" }}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
