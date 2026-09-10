"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  setDramaWatchStatus,
  clearDramaWatchStatus,
  type DramaWatchStatusValue,
} from "@/app/(public)/favorites/actions";
import { WATCH_STATUS_ORDER } from "@/lib/watchStatus";
import { useT } from "@/components/LocaleProvider";
import { CheckIcon, PencilIcon, PlusIcon } from "@/components/icons";
import RatePromptPopover, {
  isRatePromptDismissed,
  ratePromptCoords,
  type RatePromptCoords,
} from "@/components/RatePromptPopover";

/** Compact icon-button replacement for the drama heart/favorite toggle:
 *  a "+" when no watch status is set yet, a pencil once one is — both open
 *  the same small status-picker dropdown. Used everywhere a drama shows up
 *  as a row/card (list pages, a performer's or agency's filmography).
 *
 *  `variant="wide"` — тот же выбор, но широкой подписанной кнопкой. Нужен
 *  на самой странице сериала: иконку «+» в шапке не находили («я сломала
 *  себе глаза, чтобы найти кнопку, через которую можно поставить статус»
 *  — фидбек пользователя, 2026-09-10). В списках и фильмографиях иконка
 *  остаётся: там кнопка лежит на карточке и подписи ей негде взяться. */
export default function DramaStatusButton({
  dramaId,
  status,
  className,
  variant = "icon",
}: {
  dramaId: string;
  status: DramaWatchStatusValue | null;
  className?: string;
  variant?: "icon" | "wide";
}) {
  const t = useT();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Попап «поставьте оценку» после перехода в «Просмотрено» — у самой
  // кнопки, тем же порталом, что и меню статусов.
  const [ratePromptAt, setRatePromptAt] = useState<RatePromptCoords | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    }
    // Скролл (в т.ч. внутренний скролл постер-ряда) уводит кнопку из-под
    // fixed-меню — просто закрываем его.
    function onScroll() {
      setIsOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  async function choose(value: DramaWatchStatusValue | null) {
    setIsOpen(false);
    setIsSubmitting(true);
    setError(null);
    try {
      if (value === null) {
        await clearDramaWatchStatus(dramaId);
      } else {
        // Ошибка приходит значением (текст исключения в проде до
        // клиента не доезжает) — показываем её у кнопки.
        const result = await setDramaWatchStatus(dramaId, value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Только что досмотрела и своей оценки нет — мягко предложить
        // поставить (п.5.2 аудита). Ответ сервера, не пропсы: у кнопки
        // в фильмографии оценка в данные строки не приходит.
        if (
          result.completedNow &&
          !result.hasRating &&
          !isRatePromptDismissed(dramaId)
        ) {
          const rect = ref.current?.getBoundingClientRect();
          if (rect) setRatePromptAt(ratePromptCoords(rect));
        }
      }
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  const label = status
    ? t.catalog.watchStatusIs(t.catalog.watchStatus[status])
    : t.catalog.watchStatusSet;

  // Меню открывается под кнопкой и прижимается к её правому краю; у
  // широкой кнопки правый край далеко, поэтому её меню равняется по
  // ЛЕВОМУ — иначе список уезжал бы от кнопки вбок.
  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Fixed-координаты: ряды постеров скроллятся по горизонтали
    // (overflow), absolute-дропдаун ими обрезался.
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 6,
      left:
        variant === "wide"
          ? Math.max(8, Math.min(rect.left, window.innerWidth - 216))
          : Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216)),
    });
    setIsOpen((v) => !v);
  };

  return (
    <div className={`drama-status-btn ${className ?? ""}`} ref={ref}>
      {variant === "wide" ? (
        <button
          type="button"
          className={`btn btn-sm w-100 d-inline-flex align-items-center justify-content-center gap-2 ${
            status ? "btn-outline-secondary" : "btn-primary"
          }`}
          disabled={isSubmitting}
          aria-expanded={isOpen}
          onClick={openMenu}
        >
          {status ? <PencilIcon /> : <PlusIcon />}
          {/* С отметкой показываем сам статус — человек видит, что у
              него стоит, не открывая меню. Без неё — призыв. */}
          {status ? t.catalog.watchStatus[status] : t.catalog.watchStatusSet}
        </button>
      ) : (
        <button
          type="button"
          className={`round-icon-btn ${status ? "is-accent" : ""}`}
          disabled={isSubmitting}
          aria-expanded={isOpen}
          aria-label={label}
          data-tooltip={label}
          onClick={openMenu}
        >
          {status ? <PencilIcon /> : <PlusIcon />}
        </button>
      )}
      {error && <span className="small text-danger">{error}</span>}

      {/* Портал в body: у карточек-предков бывают transform'ы (stagger,
          hover постеров) — они делают position:fixed относительным себя,
          и меню улетало в случайное место страницы. */}
      {isOpen &&
        coords &&
        createPortal(
        <div
          ref={menuRef}
          className="performer-select-dropdown drama-status-dropdown"
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            right: "auto",
            zIndex: 2000,
          }}
        >
          <button type="button" className="performer-select-option" onClick={() => choose(null)}>
            <span className="flex-fill text-start">{t.catalog.watchStatusNone}</span>
            {!status && <CheckIcon />}
          </button>
          {WATCH_STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className="performer-select-option"
              onClick={() => choose(s)}
            >
              <span className="flex-fill text-start">{t.catalog.watchStatus[s]}</span>
              {status === s && <CheckIcon />}
            </button>
          ))}
        </div>,
        document.body,
      )}

      {ratePromptAt && (
        <RatePromptPopover
          dramaId={dramaId}
          coords={ratePromptAt}
          onClose={() => setRatePromptAt(null)}
        />
      )}
    </div>
  );
}
