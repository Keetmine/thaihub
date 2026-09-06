"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { setDramaRating } from "@/app/(public)/favorites/actions";
import { useT } from "@/components/LocaleProvider";
import { CheckIcon, StarIcon } from "@/components/icons";

/**
 * Своя оценка в строке таблицы — компактный вид `DramaRating` (АА2).
 *
 * Десять звёзд в колонку не влезают (это добрых десять сантиметров), а
 * жать их в строке всё равно неудобно. Поэтому тут — подпись «★ 9», по
 * клику раскрывающая список оценок: ровно тот же дропдаун, что у
 * статуса просмотра рядом (`DramaStatusSelect`), чтобы две соседние
 * колонки не вели себя по-разному.
 *
 * Меню — порталом в body с fixed-координатами: строки лежат в
 * прокручиваемых контейнерах, absolute-меню ими обрезалось бы.
 */
export default function DramaRatingSelect({
  dramaId,
  rating,
}: {
  dramaId: string;
  rating: number | null;
}) {
  const t = useT();
  const s = t.catalog.rating;
  const router = useRouter();
  const [value, setValue] = useState(rating);
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Оценка могла смениться не отсюда (страница сериала, импорт с MDL) —
  // подравниваем в рендере, как в DramaStatusSelect.
  const [seen, setSeen] = useState(rating);
  if (rating !== seen) {
    setSeen(rating);
    setValue(rating);
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

  function choose(next: number | null) {
    setIsOpen(false);
    const previous = value;
    setValue(next);
    startTransition(async () => {
      // Ошибку экшен отдаёт значением — молча откатываем ячейку:
      // шуметь в списке из сотен строк нечем.
      const result = await setDramaRating(dramaId, next);
      if (!result.ok) {
        setValue(previous);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="drama-status-select drama-rating-select" ref={ref}>
      <button
        type="button"
        className={`drama-status-select-trigger ${value != null ? "is-set" : ""}`}
        disabled={isPending}
        aria-expanded={isOpen}
        aria-label={value != null ? s.set(value) : s.none}
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
        <StarIcon />
        <span className="drama-status-select-label">{value ?? "—"}</span>
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
              <span className="flex-fill text-start">{s.clear}</span>
              {value == null && <CheckIcon />}
            </button>
            {/* Сверху вниз от десятки: высокие оценки ставят чаще, и
                тянуться за ними в конец списка незачем. */}
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
              <button
                key={n}
                type="button"
                className="performer-select-option"
                onClick={() => choose(n)}
              >
                <span className="flex-fill text-start">{n}</span>
                {value === n && <CheckIcon />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
