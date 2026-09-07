"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/components/LocaleProvider";
import { ChevronDownIcon } from "@/components/icons";

/**
 * Прокручиваемый ряд вкладок: тот же `.tab-bar`, что и был, но с
 * растушёванными краями и кнопками «влево/вправо», когда ряд не влезает.
 *
 * Механизм родился в профиле (жалоба владельца 2026-09-08: «вкладки не
 * влезают, а что ряд продолжается — не видно»), а правкой 2026-09-09
 * владелец попросил то же самое ВЕЗДЕ, где ряд может упереться в поиск
 * и кнопки справа. Поэтому здесь ОДИН компонент на все ряды сайта, а не
 * четвёртая копия одного и того же useEffect: копии рано или поздно
 * разъезжаются — одна научится чему-то, остальные нет.
 *
 * Как устроено:
 *
 * 1) классы has-more-start/has-more-end по фактическому положению
 *    прокрутки — CSS по ним растушёвывает соответствующий край, и
 *    обрезанная вкладка читается как «ряд продолжается», а не как
 *    поломанная вёрстка;
 * 2) кнопки прокрутки висят на ТЕХ ЖЕ признаках has-more-*: второго
 *    механизма для «есть ли куда крутить» не заводим, иначе кнопка и
 *    растушёвка однажды разойдутся. Каждая появляется только со своей
 *    стороны и только на устройстве с курсором (`@media (hover: hover)`
 *    в CSS): пальцем ряд листается и так, а кнопка отнимала бы место у
 *    подписей;
 * 3) активная вкладка подтягивается в видимую часть ряда. Без этого
 *    ссылка вида ?tab=communities открывала нужную панель, а сама
 *    вкладка оставалась за краем — казалось, что подсветилась не та.
 *    Прокручиваем строго scrollLeft ряда, а не scrollIntoView: последний
 *    умеет утянуть за собой и страницу целиком.
 *
 * Дети — ГОТОВАЯ разметка вкладок (`.tab-bar-item`), какая была: и
 * серверные `AppLink`, и клиентские `<a>` профиля. Компонент клиентский,
 * но дети приходят пропсом и рендерятся на сервере — без JS ряд
 * остаётся обычными ссылками, просто без кнопок и растушёвки.
 */
export default function ScrollableTabs({
  children,
  activeKey,
  dense,
}: {
  /** Сами вкладки — элементы с классом `tab-bar-item`. */
  children: ReactNode;
  /** Ключ активной вкладки: при его смене ряд подтягивает активную
   *  вкладку в видимую часть. Серверным рядам не нужен — там смена
   *  вкладки это переход, и хватает эффекта при монтировании. */
  activeKey?: string;
  /** Поджатый шаг между вкладками — для рядов, где их под десяток
   *  (профиль, сообщество). Каталогам с тремя-четырьмя вкладками
   *  привычнее просторный шаг `.tab-bar`. */
  dense?: boolean;
}) {
  const t = useT();
  const barRef = useRef<HTMLDivElement>(null);
  // Что растушёвывать: слева и/или справа ряда осталось непоказанное.
  // Оба false — ряд влез целиком, краям делать нечего.
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
    // бы страницу впустую.
    setMore((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    syncMore();
    bar.addEventListener("scroll", syncMore, { passive: true });

    // Ряд меняет ширину не только с окном: слева от него бывает
    // грид-колонка, а внутри — подписи со счётчиками, которые
    // дорисовываются позже. Наблюдаем и сам ряд, и каждую вкладку:
    // ширина РЯДА от подгрузки шрифта не меняется (он растянут на
    // колонку), а вот подписи в нём разъезжаются — и без наблюдения за
    // ними «есть куда крутить» осталось бы посчитанным по неготовому
    // тексту.
    const resize = new ResizeObserver(syncMore);
    const observeAll = () => {
      resize.disconnect();
      resize.observe(bar);
      for (const item of bar.children) resize.observe(item);
    };
    observeAll();
    // Набор вкладок меняется и без перемонтирования ряда (мягкий переход
    // на другой профиль, появившаяся вкладка «Заявки»). Тогда наблюдать
    // надо за новыми детьми, а не за выброшенными.
    const mutation = new MutationObserver(() => {
      observeAll();
      syncMore();
    });
    mutation.observe(bar, { childList: true });

    return () => {
      bar.removeEventListener("scroll", syncMore);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [syncMore]);

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

  // Активная вкладка — в видимую часть ряда (см. п.3 в шапке файла).
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
  }, [activeKey]);

  return (
    // Обёртка, а не сам `.tab-bar-row`: в ряду рядом с вкладками часто
    // живут поиск и кнопки, и они должны остаться там же, где были.
    // Обёртка забирает свободную ширину строки и служит якорем для
    // кнопок прокрутки.
    <div className={`tab-scroll${dense ? " tab-scroll-dense" : ""}`}>
      <div
        ref={barRef}
        className={`tab-bar${more.start ? " has-more-start" : ""}${more.end ? " has-more-end" : ""}`}
      >
        {children}
      </div>

      {/* Кнопки лежат ПОВЕРХ края ряда, а не в потоке слева и справа от
          него: в потоке их появление и исчезновение дёргало бы ширину
          самого ряда на каждой прокрутке. Перекрывать подписи им нечего —
          под кнопкой ровно та полоса, которую маска и так растушёвывает в
          ноль (её ширину под кнопку CSS увеличивает). Обе — обычные
          <button>: фокус, Enter и пробел бесплатно.
          Подписи лежат в словаре профиля: там кнопки появились первыми, а
          заводить второй ключ с тем же текстом ради нового места незачем. */}
      {more.start && (
        <button
          type="button"
          className="tab-scroll-btn tab-scroll-btn-start"
          aria-label={t.social.profile.tabsScrollPrev}
          onClick={() => scrollByPage(-1)}
        >
          <ChevronDownIcon />
        </button>
      )}
      {more.end && (
        <button
          type="button"
          className="tab-scroll-btn tab-scroll-btn-end"
          aria-label={t.social.profile.tabsScrollNext}
          onClick={() => scrollByPage(1)}
        >
          <ChevronDownIcon />
        </button>
      )}
    </div>
  );
}
