"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { completeTour } from "@/app/(public)/account/tourActions";

type Step = {
  /** Что подсветить: селектор элемента. Если элемента нет (другая
   *  страница, гость), шаг пропускается. */
  target: string;
  title: string;
  text: string;
  /** Перейти на этот адрес перед показом шага. */
  href?: string;
};

const STEPS: Step[] = [
  {
    target: "[data-tour='feed']",
    href: "/",
    title: "Афиша",
    text: "Здесь все концерты и фанмиты — по датам, с составом и площадкой. Фильтры сверху покажут только избранное или то, куда вы идёте.",
  },
  {
    // Есть только в ленте: без подписки на её месте пейволл, и шаг
    // пропустится сам.
    target: "[data-tour='favorite']",
    title: "Избранное и «иду»",
    text: "Сердечко сохраняет событие, а «иду» отмечает, что вы там будете, — тогда придёт напоминание, и друзья увидят, что вы собираетесь.",
  },
  {
    target: "[data-tour='artists']",
    href: "/artists",
    title: "Актёры и группы",
    text: "Профили, сериалы и концерты каждого. Отсюда можно добавить актёра в избранное, в свой список или отметить, что видели его вживую.",
  },
  {
    target: "[data-tour='locations']",
    href: "/locations",
    title: "Места съёмок",
    text: "Кафе, отели и площадки из сериалов — с картой и категориями, чтобы собрать маршрут по местам любимого сериала.",
  },
  {
    target: "[data-tour='trips']",
    href: "/trips",
    title: "Поездки",
    text: "План на даты поездки: события, брони жилья, места к посещению и общий доступ для тех, с кем едете.",
  },
  {
    target: "[data-tour='notifications']",
    title: "Уведомления",
    text: "Приглашения в поездки, заявки в друзья и ответы на комментарии приходят сюда. В настройках можно подключить Telegram, чтобы получать их в мессенджере.",
  },
  {
    target: "[data-tour='profile']",
    title: "Профиль",
    text: "Статистика, ачивки, ваши списки и билеты. Загляните сюда после первого концерта — счётчики начнут заполняться.",
  },
];

/**
 * Пошаговый тур по интерфейсу для новичков: подсветка элемента и
 * подсказка рядом. Своя обвязка вместо библиотеки — нужен ровно этот
 * сценарий, а лишняя зависимость тянула бы свои стили и конфликтовала
 * с нашей тёмной темой.
 *
 * Шаг с отсутствующим на странице элементом пропускается: вёрстка
 * меняется, и тур не должен упираться в подсветку пустоты.
 */
export default function ProductTour({ autoStart }: { autoStart: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  // Сам запускается только с главной: человек приходит сюда после
  // регистрации, а всплывать поверх произвольной страницы (да ещё
  // перехватывая клики) — навязчиво.
  const [step, setStep] = useState(autoStart && pathname === "/" ? 0 : -1);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = step >= 0 && step < STEPS.length ? STEPS[step] : null;

  const finish = useCallback(() => {
    setStep(-1);
    setRect(null);
    void completeTour();
  }, []);

  // Позиция подсветки: пересчитывается при смене шага, скролле и
  // ресайзе — иначе окно уезжает от элемента.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;

    const locate = () => {
      const el = document.querySelector(current.target);
      // Нулевой размер = элемент скрыт (ссылки шапки живут и в
      // десктопном ряду, и в мобильной шторке — на узких экранах
      // первый совпавший невидим, и окно тура прилипало к 0,0).
      const rect = el?.getBoundingClientRect();
      if (!el || !rect || rect.width === 0) {
        // Элемента нет — идём дальше, не показывая пустое окно.
        if (!cancelled) setStep((s) => (s + 1 < STEPS.length ? s + 1 : -1));
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      if (!cancelled) setRect(el.getBoundingClientRect());
    };

    // Небольшая задержка: после перехода на другую страницу элемент
    // появляется не мгновенно.
    const timer = setTimeout(locate, current.href ? 700 : 120);
    window.addEventListener("scroll", locate, true);
    window.addEventListener("resize", locate);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("scroll", locate, true);
      window.removeEventListener("resize", locate);
    };
  }, [current, step]);

  // Переход на нужную страницу перед шагом — клиентской навигацией,
  // чтобы не перезагружать приложение целиком.
  useEffect(() => {
    if (!current?.href) return;
    if (pathname !== current.href) router.push(current.href);
  }, [current, pathname, router]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        setStep((s) => (s + 1 < STEPS.length ? s + 1 : -1));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, finish]);

  if (!current || !rect) return null;

  const isLast = step === STEPS.length - 1;
  const pad = 8;
  // Подсказка снизу от элемента, а если он у нижнего края — сверху.
  const below = rect.bottom + 200 < window.innerHeight;
  const tipTop = below ? rect.bottom + pad + 6 : Math.max(12, rect.top - 190);

  return (
    <>
      <div className="tour-backdrop" onClick={finish} />
      <div
        className="tour-highlight"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }}
      />
      <div
        className="tour-tip"
        style={{
          top: tipTop,
          left: Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - 340)),
        }}
      >
        <p className="tour-tip-title mb-1">{current.title}</p>
        <p className="small text-secondary mb-3">{current.text}</p>
        <div className="d-flex align-items-center justify-content-between gap-2">
          <span className="small text-secondary">
            {step + 1} из {STEPS.length}
          </span>
          <span className="d-flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={finish}>
              {isLast ? "Закрыть" : "Пропустить"}
            </button>
            {!isLast && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setStep((s) => s + 1)}
              >
                Далее
              </button>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
