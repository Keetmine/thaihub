"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  setDramaWatchStatus,
  clearDramaWatchStatus,
  type DramaWatchStatusValue,
} from "@/app/(public)/favorites/actions";
import { WATCH_STATUS_ORDER } from "@/lib/watchStatus";
import { useT } from "@/components/LocaleProvider";
import { CheckIcon } from "@/components/icons";

/**
 * Статус просмотра в колонке таблицы каталога — подпись, по клику
 * раскрывающая список статусов.
 *
 * Нативный `<select>` тут был первой версией и владельцу не понравился
 * («какой-то он странный»): его список рисует ОС, и на тёмной теме он
 * выпадал из оформления сайта. Поэтому — тот же кастомный дропдаун,
 * что у `DramaStatusButton` (`.performer-select-dropdown`), только
 * триггер не иконка-карандаш, а сама подпись статуса.
 *
 * Меню — порталом в body с fixed-координатами: строки каталога лежат в
 * прокручиваемых контейнерах, и absolute-меню ими обрезалось бы.
 *
 * Значение держим локально и рисуем сразу: выбрал — подпись сменилась,
 * не дожидаясь сервера; `router.refresh()` следом подтягивает остальное
 * (у «Просмотрено» сервер досчитывает серии, и колонка прогресса должна
 * это увидеть).
 */
export default function DramaStatusSelect({
  dramaId,
  status,
  className = "",
}: {
  dramaId: string;
  status: DramaWatchStatusValue | null;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<DramaWatchStatusValue | null>(status);
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Статус мог смениться не отсюда (кнопка на странице сериала, импорт
  // списка) — подравниваем локальное состояние в рендере, как в
  // EpisodeProgress: useState читает начальное значение только при
  // монтировании, и после router.refresh() ячейка осталась бы старой.
  const [seen, setSeen] = useState(status);
  if (status !== seen) {
    setSeen(status);
    setValue(status);
  }

  useEffect(() => {
    if (!isOpen) return;
    function onClick(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    }
    // Прокрутка уводит строку из-под fixed-меню — просто закрываем.
    function onScroll() {
      setIsOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [isOpen]);

  function choose(next: DramaWatchStatusValue | null) {
    setIsOpen(false);
    const previous = value;
    setValue(next);
    startTransition(async () => {
      // Ошибку экшен возвращает значением (текст исключения в проде до
      // клиента не доезжает) — молча откатываем ячейку: шуметь в списке
      // из сотен строк нечем.
      const result = next
        ? await setDramaWatchStatus(dramaId, next)
        : await clearDramaWatchStatus(dramaId);
      if (result && typeof result === "object" && "ok" in result && !result.ok) {
        setValue(previous);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={`drama-status-select ${className}`} ref={ref}>
      <button
        type="button"
        className={`drama-status-select-trigger ${value ? "is-set" : ""}`}
        disabled={isPending}
        aria-expanded={isOpen}
        aria-label={
          value ? t.catalog.watchStatusIs(t.catalog.watchStatus[value]) : t.catalog.watchStatusSet
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setCoords({
            top: rect.bottom + 6,
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 216)),
          });
          setIsOpen((v) => !v);
        }}
      >
        <span className="drama-status-select-label">
          {value ? t.catalog.watchStatus[value] : t.catalog.watchStatusNone}
        </span>
        <span className="drama-status-select-caret" aria-hidden>
          ▾
        </span>
      </button>

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
              {!value && <CheckIcon />}
            </button>
            {WATCH_STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className="performer-select-option"
                onClick={() => choose(s)}
              >
                <span className="flex-fill text-start">{t.catalog.watchStatus[s]}</span>
                {value === s && <CheckIcon />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
