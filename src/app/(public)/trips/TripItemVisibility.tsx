"use client";

import { useT } from "@/components/LocaleProvider";

/** Кто видит отдельную запись поездки. Значения повторяют enum
 *  `TripItemVisibility` из схемы; PARTICIPANTS — значение по умолчанию,
 *  так же ведут себя записи, созданные до появления поля. */
export type TripItemVisibilityValue = "PRIVATE" | "PARTICIPANTS" | "FRIENDS" | "PUBLIC";

/** Порядок вариантов — от закрытого к открытому, как в форме поездки. */
export const ITEM_VISIBILITY_ORDER: readonly TripItemVisibilityValue[] = [
  "PRIVATE",
  "PARTICIPANTS",
  "FRIENDS",
  "PUBLIC",
] as const;

export function isItemVisibility(value: unknown): value is TripItemVisibilityValue {
  return (
    value === "PRIVATE" || value === "PARTICIPANTS" || value === "FRIENDS" || value === "PUBLIC"
  );
}

/**
 * Радио-выбор «кто это видит» — один на все формы поездки: дело, личное
 * событие, отель, перелёт. Поле есть и в соло-поездке: FRIENDS и PUBLIC
 * там осмысленны (поездку могут видеть друзья или все), а PRIVATE — это
 * прежняя галочка «приватное».
 *
 * Radio, а не select: у каждого варианта своя подсказка, и без неё
 * «Участники» и «Все» на глаз не различаются — у поездки уже есть своя
 * видимость, и легко решить, что это про неё.
 */
export function ItemVisibilityField({
  defaultValue = "PARTICIPANTS",
}: {
  defaultValue?: TripItemVisibilityValue;
}) {
  const t = useT();
  return (
    <div>
      <label className="form-label small text-secondary d-block mb-1">
        {t.trips.itemVisibility.label}
      </label>
      <div className="d-flex flex-column gap-1">
        {ITEM_VISIBILITY_ORDER.map((value) => (
          <label key={value} className="form-check mb-0">
            <input
              type="radio"
              name="visibility"
              value={value}
              defaultChecked={value === defaultValue}
              className="form-check-input"
            />
            <span className="form-check-label small">
              {t.trips.itemVisibility.options[value]}{" "}
              <span className="text-secondary">— {t.trips.itemVisibility.hints[value]}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Бейдж видимости в строке записи. У PARTICIPANTS бейджа нет: это
 *  значение по умолчанию, и подписывать им каждую строку — шум. */
export function ItemVisibilityBadge({
  visibility,
}: {
  visibility: TripItemVisibilityValue;
}) {
  const t = useT();
  if (visibility === "PARTICIPANTS") return null;
  return (
    <span className="badge rounded-pill text-bg-dark border" style={{ fontSize: "0.6rem" }}>
      {t.trips.itemVisibility.badges[visibility]}
    </span>
  );
}
