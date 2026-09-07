"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import ScrollableTabs from "@/components/ScrollableTabs";

export type CommunityTabKey =
  | "discussions"
  | "meetups"
  | "trips"
  | "places"
  | "requests";

/**
 * Правая колонка страницы сообщества: ряд вкладок + панели.
 *
 * Устроено как `ProfileTabs` профиля и по тем же причинам: контент
 * панелей рендерит СЕРВЕРНАЯ страница и передаёт готовыми ReactNode —
 * так закрытое зрителю не попадает даже в пропсы, а клиенту остаётся
 * только переключение. Свой файл, а не общий с профилем: набор вкладок
 * и адреса у них разные, а общий компонент пришлось бы параметризовать
 * ровно до неразличимости.
 *
 * Вкладки — настоящие ссылки на `?tab=…`: ссылку на обсуждения
 * сообщества должно быть можно скинуть. Обычный клик перехватываем и
 * правим адрес через history.pushState — панели уже смонтированы,
 * перерисовывать страницу незачем.
 */
export default function CommunityTabs({
  initialTab,
  tabs,
}: {
  initialTab: CommunityTabKey;
  tabs: { key: CommunityTabKey; label: string; content: ReactNode }[];
}) {
  const pathname = usePathname();
  const firstKey = tabs[0]?.key ?? "discussions";
  const validInitial = tabs.some((t) => t.key === initialTab) ? initialTab : firstKey;
  const [activeTab, setActiveTab] = useState<CommunityTabKey>(validInitial);
  const [prevInitial, setPrevInitial] = useState(validInitial);

  // initialTab приходит из ?tab= адреса; при мягкой навигации меняется
  // только проп — синхронизируем в рендере, как ProfileTabs.
  if (validInitial !== prevInitial) {
    setPrevInitial(validInitial);
    setActiveTab(validInitial);
  }

  // «Назад» после переключения: адрес меняли мимо роутера, и сам он о
  // нём не узнает — слушаем popstate.
  useEffect(() => {
    function onPop() {
      const tab = new URLSearchParams(window.location.search).get("tab");
      setActiveTab(tabs.some((t) => t.key === tab) ? (tab as CommunityTabKey) : firstKey);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [tabs, firstKey]);

  return (
    <>
      <div className="tab-bar-row">
        {/* Прокрутка ряда — общая с профилем и каталогами
            (ScrollableTabs): вкладок тут до шести, и со счётчиками в
            подписях они на узком экране в строку не влезают. */}
        <ScrollableTabs activeKey={activeTab} dense>
          {tabs.map((tab) => (
            <a
              key={tab.key}
              href={`${pathname}?tab=${tab.key}`}
              className={`tab-bar-item ${activeTab === tab.key ? "active" : ""}`}
              aria-current={activeTab === tab.key ? "page" : undefined}
              onClick={(e) => {
                // Ctrl/⌘-клик и средняя кнопка — обычное поведение
                // ссылки: открыть в новой вкладке.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                setActiveTab(tab.key);
                window.history.pushState(null, "", `${pathname}?tab=${tab.key}`);
              }}
            >
              {tab.label}
            </a>
          ))}
        </ScrollableTabs>
      </div>

      {tabs.map((tab) => (
        <div key={tab.key} hidden={activeTab !== tab.key}>
          {tab.content}
        </div>
      ))}
    </>
  );
}
