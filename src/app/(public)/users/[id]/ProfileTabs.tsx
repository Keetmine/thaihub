"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/components/LocaleProvider";
import { ChevronDownIcon } from "@/components/icons";

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
 * паттерн, что был в кабинете. Ряд вкладок скроллится горизонтально
 * (.profile-tab-row в globals.css).
 *
 * Про прокрутку ряда (жалоба владельца 2026-09-08 «вкладки не влезают»).
 * Вкладок стало десять, и на 1280 последние две («Места и списки»,
 * «Сообщества») просто обрезались краем колонки — прокрутка была, но
 * выглядела как поломанная вёрстка: ни полосы (она спрятана), ни любого
 * другого признака, что справа что-то есть. Поэтому здесь два
 * дополнения к CSS:
 *
 * 1) классы has-more-start/has-more-end по фактическому положению
 *    прокрутки — CSS по ним растушёвывает соответствующий край, и
 *    обрезанная вкладка читается как «ряд продолжается», а не как
 *    обрезка;
 * 2) активная вкладка подтягивается в видимую часть ряда. Без этого
 *    ссылка вида ?tab=communities открывала нужную панель, а сама
 *    вкладка оставалась за краем — казалось, что подсветилась не та.
 *
 * Прокручиваем строго scrollLeft самого ряда, а не scrollIntoView:
 * последний умеет утянуть за собой и страницу целиком.
 *
 * Кнопки «влево/вправо» (правка владельца 2026-09-08: растушёвки мало,
 * «хочу ещё и кнопки») висят на ТЕХ ЖЕ признаках has-more-*: второго
 * механизма для «есть ли куда крутить» не заводим, иначе кнопка и
 * растушёвка рано или поздно разойдутся. Каждая кнопка появляется только
 * со своей стороны и только на устройстве с курсором (`@media (hover:
 * hover)` в CSS): пальцем ряд листается и так, а кнопка там лишь
 * отнимала бы место у подписей.
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
  const t = useT();
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

  const barRef = useRef<HTMLDivElement>(null);
  // Что показывать растушёванным: слева и/или справа ряда осталось
  // непоказанное. Оба false — ряд влез целиком, краям делать нечего.
  const [more, setMore] = useState({ start: false, end: false });

  const syncMore = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    // Запас в 1px: дробная ширина колонки даёт scrollWidth на доли
    // пикселя больше clientWidth даже у ряда, который влез.
    const max = bar.scrollWidth - bar.clientWidth;
    const next = { start: bar.scrollLeft > 1, end: bar.scrollLeft < max - 1 };
    // Возвращаем прежний объект, когда ничего не изменилось: событий
    // прокрутки за один жест десятки, и каждый новый объект перерисовывал
    // бы весь профиль впустую.
    setMore((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    syncMore();
    bar.addEventListener("scroll", syncMore, { passive: true });
    // Ряд меняет ширину не только с окном: слева от него грид-колонка,
    // а внутри — подписи со счётчиками, которые дорисовываются позже.
    // Наблюдаем и сам ряд, и каждую вкладку: ширина РЯДА от подгрузки
    // шрифта не меняется (он растянут на колонку), а вот подписи в нём
    // разъезжаются — и без наблюдения за ними «есть куда крутить»
    // осталось бы посчитанным по неготовому тексту.
    const observer = new ResizeObserver(syncMore);
    observer.observe(bar);
    for (const item of bar.children) observer.observe(item);
    return () => {
      bar.removeEventListener("scroll", syncMore);
      observer.disconnect();
    };
  }, [syncMore, tabs.length]);

  // Кнопки прокрутки: шаг — почти целый экран ряда, но с запасом, чтобы
  // крайняя вкладка осталась видна и было понятно, что это продолжение
  // того же ряда, а не другой набор. Нижняя граница в 120px — на случай
  // очень узкой колонки, где 70% ширины меньше одной вкладки.
  const scrollByPage = useCallback((direction: -1 | 1) => {
    const bar = barRef.current;
    if (!bar) return;
    const step = Math.max(120, bar.clientWidth * 0.7);
    // «Плавно» — только тем, кто не просил обратного: при
    // prefers-reduced-motion уезжаем мгновенно (matchMedia, а не CSS:
    // behavior задаётся в JS и в медиазапрос не попадает).
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bar.scrollBy({ left: direction * step, behavior: reduced ? "auto" : "smooth" });
  }, []);

  // Активная вкладка — в видимую часть ряда (см. п.2 в шапке файла).
  useEffect(() => {
    const bar = barRef.current;
    const item = bar?.querySelector<HTMLElement>(".tab-bar-item.active");
    if (!bar || !item) return;
    const barBox = bar.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    // Отступ, чтобы вкладка не прилипала к растушёванному краю.
    const pad = 24;
    if (itemBox.right > barBox.right) bar.scrollLeft += itemBox.right - barBox.right + pad;
    else if (itemBox.left < barBox.left) bar.scrollLeft -= barBox.left - itemBox.left + pad;
  }, [activeTab]);

  return (
    <div>
      <div className="tab-bar-row profile-tab-row">
        <div
          ref={barRef}
          className={`tab-bar${more.start ? " has-more-start" : ""}${more.end ? " has-more-end" : ""}`}
        >
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
        </div>

        {/* Кнопки лежат ПОВЕРХ края ряда, а не в потоке слева и справа
            от него: в потоке их появление и исчезновение дёргало бы
            ширину самого ряда на каждой прокрутке. Перекрывать подписи
            им нечего — под кнопкой ровно та полоса, которую маска и так
            растушёвывает в ноль (её ширину под кнопку CSS увеличивает).
            Обе — обычные <button>: фокус, Enter и пробел бесплатно. */}
        {more.start && (
          <button
            type="button"
            className="profile-tab-scroll profile-tab-scroll-start"
            aria-label={t.social.profile.tabsScrollPrev}
            onClick={() => scrollByPage(-1)}
          >
            <ChevronDownIcon />
          </button>
        )}
        {more.end && (
          <button
            type="button"
            className="profile-tab-scroll profile-tab-scroll-end"
            aria-label={t.social.profile.tabsScrollNext}
            onClick={() => scrollByPage(1)}
          >
            <ChevronDownIcon />
          </button>
        )}
      </div>

      {tabs.map((tab) => (
        <div key={tab.key} style={{ display: activeTab === tab.key ? undefined : "none" }}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
