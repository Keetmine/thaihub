"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { setDramaRating } from "@/app/(public)/favorites/actions";
import { useT } from "@/components/LocaleProvider";
import { StarIcon } from "@/components/icons";
import StarRatingInput, { formatRating } from "@/components/StarRatingInput";

/**
 * Своя оценка в строке таблицы — компактный вид `DramaRating` (АА2).
 *
 * Десять звёзд в колонку не влезают (это добрых десять сантиметров), а
 * половинки в такой мелочи ещё и не нажать. Поэтому тут подпись «★ 8.5»,
 * по клику раскрывающая окошко с теми же звёздами покрупнее — не список
 * из двадцати чисел: с половинками он стал бы простынёй.
 *
 * Окошко — порталом в body с fixed-координатами: строки лежат в
 * прокручиваемых контейнерах, absolute-меню ими обрезалось бы (то же
 * решение, что у `DramaStatusSelect` рядом).
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
    // Прокрутка уводит строку из-под fixed-окошка — просто закрываем.
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
    // Окошко закрываем сразу: оценку ставят одним движением, и
    // висящая панель после клика только мешала бы.
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
        aria-label={value != null ? s.set(formatRating(value)) : s.none}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setCoords({
            top: rect.bottom + 6,
            // Окошко со звёздами шире меню статусов — держим его в
            // экране по своей ширине, а не по чужой.
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 260)),
          });
          setIsOpen((v) => !v);
        }}
      >
        <StarIcon />
        <span className="drama-status-select-label">
          {value != null ? formatRating(value) : "—"}
        </span>
      </button>

      {isOpen &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            className="performer-select-dropdown rating-popover"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              right: "auto",
              zIndex: 2000,
            }}
          >
            <StarRatingInput
              value={value}
              onChange={choose}
              labelFor={(n) => (n === value ? s.clear : s.choose(formatRating(n)))}
              hintFor={(n) => s.hint(formatRating(n))}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={value == null}
              onClick={() => choose(null)}
            >
              {s.clear}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
