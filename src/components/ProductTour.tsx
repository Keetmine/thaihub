"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { completeTour } from "@/app/(public)/account/tourActions";
import { useLocaleHref, useT } from "@/components/LocaleProvider";

type Step = {
  /** Что подсветить: селектор элемента. Если элемента нет (другая
   *  страница, гость, узкий экран), шаг пропускается. */
  target: string;
  /** Перейти на этот адрес перед показом шага. */
  href?: string;
  /** Ключ в словаре: тексты тура живут там, а не в массиве. */
  key:
    | "events"
    | "fav"
    | "artists"
    | "series"
    | "locations"
    | "trips"
    | "search"
    | "notifications"
    | "profile";
};

const STEPS: Step[] = [
  {
    // Афиша живёт на /events: главная давно стала сводкой «для своих»,
    // и старый шаг с href="/" молча пропускался — [data-tour='feed']
    // там больше нет.
    key: "events" as const,
    target: "[data-tour='feed']",
    href: "/events",
  },
  {
    // Есть только в ленте: без подписки на её месте пейволл, и шаг
    // пропустится сам.
    key: "fav" as const,
    target: "[data-tour='favorite']",
  },
  {
    key: "artists" as const,
    target: "[data-tour='artists']",
    href: "/artists",
  },
  {
    // Ссылка «Сериалы» в шапке: каталог, статусы просмотра и календарь
    // серий. На телефоне ссылки живут в шторке — шаг пропустится.
    key: "series" as const,
    target: "[data-tour='series']",
  },
  {
    key: "locations" as const,
    target: "[data-tour='locations']",
    href: "/locations",
  },
  {
    key: "trips" as const,
    target: "[data-tour='trips']",
    href: "/trips",
  },
  {
    // Поле на самой странице поиска — оно, в отличие от шапочного,
    // видно на любой ширине экрана (см. docs/design-system.md).
    key: "search" as const,
    target: ".search-page-box",
    href: "/search",
  },
  {
    key: "notifications" as const,
    target: "[data-tour='notifications']",
  },
  {
    key: "profile" as const,
    target: "[data-tour='profile']",
  },
];

/** Адрес без языкового префикса: на русской версии usePathname отдаёт
 *  «/ru/...», и сравнение с href шага без нормализации не сходилось. */
function stripLocale(pathname: string): string {
  return pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
}

/** Первый ВИДИМЫЙ элемент по селектору: метки живут и в десктопной
 *  шапке, и в мобильной шторке — первый совпавший в DOM может быть
 *  скрыт, и окно тура прилипало к 0,0. */
function findVisible(selector: string): { el: Element; rect: DOMRect } | null {
  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return { el, rect };
  }
  return null;
}

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
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const toHref = useLocaleHref();
  // Сам запускается только с главной: человек приходит сюда после
  // регистрации, а всплывать поверх произвольной страницы (да ещё
  // перехватывая клики) — навязчиво.
  const [step, setStep] = useState(autoStart && stripLocale(pathname) === "/" ? 0 : -1);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = step >= 0 && step < STEPS.length ? STEPS[step] : null;

  const finish = useCallback(() => {
    setStep(-1);
    setRect(null);
    void completeTour();
  }, []);

  // Следующий шаг (или конец). Rect сбрасывается сразу: иначе, пока
  // ищется элемент нового шага, подсказка с новым текстом висела бы на
  // месте старого элемента.
  const advance = useCallback(() => {
    setRect(null);
    setStep((s) => (s + 1 < STEPS.length ? s + 1 : -1));
  }, []);

  // «Пройти заново» из настроек: server action сбрасывает отметку и
  // уводит на главную с ?tour=1 — сам компонент к этому моменту давно
  // смонтирован (он живёт в layout), и решение «стартовать ли», принятое
  // при маунте, уже не пересмотрит. Метку читаем при каждой смене адреса
  // и тут же стираем из строки, чтобы перезагрузка не запускала тур
  // повторно.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tour") !== "1") return;
    params.delete("tour");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    // Из колбэка, не синхронно: setState прямо в теле эффекта запускает
    // каскадный ререндер (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => setStep(0), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  // Позиция подсветки: пересчитывается при смене шага, скролле и
  // ресайзе — иначе окно уезжает от элемента.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    // Элемент ждём с повторами, а не пропускаем шаг с первой попытки:
    // после клиентского перехода страница может грузиться не одну
    // секунду (медленная сеть, холодная dev-сборка), и тур молча
    // проскакивал шаги. Пропуск — только когда элемента так и не
    // нашлось за MAX_WAIT_MS: он и правда не для этой страницы (гость,
    // пейволл, узкий экран).
    const RETRY_MS = 200;
    const MAX_WAIT_MS = 4000;
    let waited = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const locate = () => {
      if (cancelled) return;
      const found = findVisible(current.target);
      if (!found) {
        if (waited < MAX_WAIT_MS) {
          waited += RETRY_MS;
          retryTimer = setTimeout(locate, RETRY_MS);
        } else {
          // Элемента нет — идём дальше, не показывая пустое окно.
          advance();
        }
        return;
      }
      found.el.scrollIntoView({ block: "center", behavior: "smooth" });
      setRect(found.el.getBoundingClientRect());
    };

    // Скролл/ресайз только двигают уже найденную подсветку — без
    // ретраев, иначе каждое событие плодило бы свою цепочку таймеров.
    const reposition = () => {
      if (cancelled) return;
      const found = findVisible(current.target);
      if (found) setRect(found.el.getBoundingClientRect());
    };

    // Небольшая задержка первой попытки: после перехода на другую
    // страницу элемент появляется не мгновенно.
    const timer = setTimeout(locate, current.href ? 400 : 120);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [current, step, advance]);

  // Переход на нужную страницу перед шагом — клиентской навигацией,
  // чтобы не перезагружать приложение целиком. Адрес — с языковым
  // префиксом: router.push("/artists") с /ru/... уводил бы на
  // английскую версию.
  useEffect(() => {
    if (!current?.href) return;
    if (stripLocale(pathname) !== current.href) router.push(toHref(current.href));
  }, [current, pathname, router, toHref]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") advance();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, finish, advance]);

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
        <p className="tour-tip-title mb-1">{t.widgets.tour[`${current.key}Title`]}</p>
        <p className="small text-secondary mb-3">{t.widgets.tour[`${current.key}Text`]}</p>
        <div className="d-flex align-items-center justify-content-between gap-2">
          <span className="small text-secondary">
            {t.widgets.tour.stepOf(step + 1, STEPS.length)}
          </span>
          <span className="d-flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={finish}>
              {isLast ? t.widgets.tour.close : t.widgets.tour.skip}
            </button>
            {!isLast && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={advance}
              >
                {t.widgets.tour.next}
              </button>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
