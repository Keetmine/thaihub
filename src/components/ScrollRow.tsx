"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/icons";

/**
 * Горизонтальный ряд с растушёванными краями и кнопками «влево/вправо».
 *
 * Механизм родился в ряду вкладок (жалоба владельца 2026-09-08:
 * «вкладки не влезают, а что ряд продолжается — не видно»), а правкой
 * 2026-09-16 владелец попросила то же самое у ЛЕНТ ПОСТЕРОВ — «везде,
 * где такие блоки». Поэтому здесь ОДИН движок на все ряды сайта:
 * `ScrollableTabs` теперь тонкая обёртка над ним, а ленты постеров
 * зовут его напрямую. Вторая копия этих ста строк рано или поздно
 * разъехалась бы с первой — одна научилась бы чему-то, другая нет.
 *
 * Как устроено:
 *
 * 1) классы has-more-start/has-more-end по фактическому положению
 *    прокрутки — CSS по ним растушёвывает соответствующий край, и
 *    обрезанный элемент читается как «ряд продолжается», а не как
 *    поломанная вёрстка;
 * 2) кнопки висят на ТЕХ ЖЕ признаках has-more-*: второго механизма для
 *    «есть ли куда крутить» не заводим, иначе кнопка и растушёвка
 *    однажды разойдутся. Каждая появляется только со своей стороны и
 *    только на устройстве с курсором (`@media (hover: hover)` в CSS):
 *    пальцем ряд листается и так, а кнопка отнимала бы место;
 * 3) активный элемент подтягивается в видимую часть ряда. Без этого
 *    ссылка вида ?tab=communities открывала нужную панель, а сама
 *    вкладка оставалась за краем — казалось, что подсветилась не та.
 *    Прокручиваем строго scrollLeft ряда, а не scrollIntoView: последний
 *    умеет утянуть за собой и страницу целиком.
 *
 * Дети приходят пропсом и рендерятся на сервере — без JS ряд остаётся
 * обычной прокруткой, просто без кнопок и растушёвки.
 */
export default function ScrollRow({
  children,
  /** Класс самого прокручиваемого элемента (`tab-bar`, `poster-row`…). */
  rowClassName,
  /** Класс обёртки — она забирает ширину строки и служит якорем кнопкам. */
  wrapperClassName,
  /** Префикс классов кнопок: `${btnPrefix}-btn`, `-btn-start`, `-btn-end`. */
  btnPrefix,
  prevLabel,
  nextLabel,
  /** Селектор активного элемента внутри ряда — его подтянет в видимую
   *  часть при монтировании и при смене `activeKey`. */
  activeSelector,
  activeKey,
  showBar = false,
}: {
  children: ReactNode;
  rowClassName: string;
  wrapperClassName: string;
  btnPrefix: string;
  prevLabel: string;
  nextLabel: string;
  activeSelector?: string;
  activeKey?: string;
  /** Рисовать под рядом СВОЮ полосу прокрутки (правка владельца
   *  2026-09-16: «саму линию скрола тоже добавляем»).
   *
   *  Своя, а не нативная, потому что нативную на macOS показать всегда
   *  нельзя: система рисует её наплывающей — появляется на полсекунды
   *  во время жеста и пропадает. Ни `overflow-x: scroll`, ни
   *  `::-webkit-scrollbar` с непрозрачным треком этого не меняют
   *  (проверено: `offsetHeight === clientHeight`, места полоса не
   *  занимает). А линия нужна затем, чтобы было видно, СКОЛЬКО ещё
   *  осталось, — растушёванный край и кнопки этого не говорят. */
  showBar?: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  // Что растушёвывать: слева и/или справа осталось непоказанное.
  // Оба false — ряд влез целиком, краям делать нечего.
  const [more, setMore] = useState({ start: false, end: false });
  // Своя полоса: доля видимого и сдвиг, обе в процентах ширины ряда.
  const [bar, setBar] = useState({ width: 0, left: 0 });

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

    // Ползунок своей полосы. Ряд влез целиком — ширина 0, и полосы нет.
    const visible = bar.scrollWidth > 0 ? bar.clientWidth / bar.scrollWidth : 1;
    const nextBar =
      visible >= 1
        ? { width: 0, left: 0 }
        : {
            width: visible * 100,
            left: (bar.scrollLeft / bar.scrollWidth) * 100,
          };
    setBar((prev) =>
      // Округляем до десятых процента: иначе дробный scrollLeft после
      // плавной прокрутки давал бы новый объект на каждом кадре.
      Math.abs(prev.width - nextBar.width) < 0.1 && Math.abs(prev.left - nextBar.left) < 0.1
        ? prev
        : nextBar,
    );
  }, []);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    syncMore();
    bar.addEventListener("scroll", syncMore, { passive: true });

    // Ряд меняет ширину не только с окном: слева от него бывает
    // грид-колонка, а внутри — подписи и картинки, которые дорисовываются
    // позже. Наблюдаем и сам ряд, и каждого ребёнка: ширина РЯДА от
    // подгрузки шрифта не меняется (он растянут на колонку), а вот
    // содержимое разъезжается — и без наблюдения за ним «есть куда
    // крутить» осталось бы посчитанным по неготовой разметке.
    const resize = new ResizeObserver(syncMore);
    const observeAll = () => {
      resize.disconnect();
      resize.observe(bar);
      for (const item of bar.children) resize.observe(item);
    };
    observeAll();
    // Набор детей меняется и без перемонтирования ряда (мягкий переход на
    // другой профиль, появившаяся вкладка). Тогда наблюдать надо за
    // новыми детьми, а не за выброшенными.
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

  // Шаг — почти целый экран ряда, но с запасом, чтобы крайний элемент
  // остался виден и было понятно, что это продолжение того же ряда, а не
  // другой набор. Нижняя граница в 120px — на случай очень узкой колонки,
  // где 70% ширины меньше одного элемента.
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

  // Активный элемент — в видимую часть ряда (см. п.3 в шапке файла).
  useEffect(() => {
    const bar = barRef.current;
    const item = activeSelector ? bar?.querySelector<HTMLElement>(activeSelector) : null;
    if (!bar || !item) return;
    const barBox = bar.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    // Отступ, чтобы элемент не прилипал к растушёванному краю.
    const pad = 24;
    if (itemBox.right > barBox.right) bar.scrollLeft += itemBox.right - barBox.right + pad;
    else if (itemBox.left < barBox.left) bar.scrollLeft -= barBox.left - itemBox.left + pad;
  }, [activeKey, activeSelector]);

  return (
    <div className={wrapperClassName}>
      <div
        ref={barRef}
        className={`${rowClassName}${more.start ? " has-more-start" : ""}${
          more.end ? " has-more-end" : ""
        }`}
      >
        {children}
      </div>

      {/* Своя линия прокрутки под рядом. Ползунок — доля видимого, его
          сдвиг — доля прокрученного; оба в процентах, поэтому полоса
          верна при любой ширине без пересчёта на ресайз. */}
      {showBar && bar.width > 0 && (
        <div className={`${btnPrefix}-bar`} aria-hidden>
          <span style={{ width: `${bar.width}%`, left: `${bar.left}%` }} />
        </div>
      )}

      {/* Кнопки лежат ПОВЕРХ края ряда, а не в потоке слева и справа от
          него: в потоке их появление и исчезновение дёргало бы ширину
          самого ряда на каждой прокрутке. Перекрывать им нечего — под
          кнопкой ровно та полоса, которую маска и так растушёвывает в
          ноль. Обе — обычные <button>: фокус, Enter и пробел бесплатно. */}
      {more.start && (
        <button
          type="button"
          className={`${btnPrefix}-btn ${btnPrefix}-btn-start`}
          aria-label={prevLabel}
          onClick={() => scrollByPage(-1)}
        >
          <ChevronDownIcon />
        </button>
      )}
      {more.end && (
        <button
          type="button"
          className={`${btnPrefix}-btn ${btnPrefix}-btn-end`}
          aria-label={nextLabel}
          onClick={() => scrollByPage(1)}
        >
          <ChevronDownIcon />
        </button>
      )}
    </div>
  );
}
