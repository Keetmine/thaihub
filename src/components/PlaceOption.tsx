"use client";

import UploadImage from "@/components/UploadImage";
import { categoryEmoji } from "@/lib/locationCategories";
import { useT } from "@/components/LocaleProvider";
import type { LocationOption } from "@/lib/locationSearch";

/**
 * Строка найденного места в выборе: фото, название, категория
 * (правка владельца 2026-09-22: «добавление мест неудобное и выводится
 * некрасиво»). Раньше в выдаче стояло одно название, и десяток похожих
 * «Siam …» был неразличим.
 *
 * Список результатов рисуется В ПОТОКЕ, а не выпадашкой поверх: почти
 * все места добавляют из модалки, а у неё своя прокрутка — абсолютная
 * выпадашка внутри обрезалась на третьем результате.
 */
export function PlaceOptionButton({
  option,
  onPick,
  disabled,
}: {
  option: LocationOption;
  onPick: () => void;
  disabled?: boolean;
}) {
  const t = useT();
  const emoji = categoryEmoji(option.category);
  const category = option.category ? t.catalog.locationCategory[option.category] : null;
  return (
    <button
      type="button"
      className="place-option"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
    >
      <span className="place-option-photo">
        {option.photoUrl ? (
          <UploadImage src={option.photoUrl} alt="" sizes="3rem" />
        ) : (
          <span aria-hidden>{emoji ?? "📍"}</span>
        )}
      </span>
      <span className="place-option-text">
        <span className="place-option-name">{option.name}</span>
        {(category || option.own) && (
          <span className="small text-secondary">
            {category}
            {category && option.own ? " · " : ""}
            {option.own ? t.trips.places.ownMark : ""}
          </span>
        )}
      </span>
    </button>
  );
}

/** Найденное списком: пусто — ничего не рисуем, подсказки к полю живут
 *  у вызывающего. */
export default function PlaceOptions({
  options,
  onPick,
  disabled,
}: {
  options: LocationOption[];
  onPick: (option: LocationOption) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <div className="place-options">
      {options.map((option) => (
        <PlaceOptionButton
          key={option.id}
          option={option}
          disabled={disabled}
          onPick={() => onPick(option)}
        />
      ))}
    </div>
  );
}
