"use client";

import { useT } from "@/components/LocaleProvider";
import type { TripItemVisibilityValue } from "./itemVisibility";

export type { TripItemVisibilityValue };

/**
 * Радио-выбор «кто это видит» — один на все формы поездки: дело, личное
 * событие, отель, перелёт. Поле есть и в соло-поездке: FRIENDS и PUBLIC
 * там осмысленны (поездку могут видеть друзья или все), а PRIVATE — это
 * прежняя галочка «приватное».
 *
 * Radio, а не select: у каждого варианта своя подсказка, и без неё
 * «Участники» и «Все» на глаз не различаются — у поездки уже есть своя
 * видимость, и легко решить, что это про неё.
 *
 * `options` приходит готовым со страницы поездки
 * (`itemVisibilityChoices`): запись не может быть виднее самой поездки,
 * поэтому у поездки FRIENDS варианта «Все» тут нет, а у приватной
 * соло-поездки список пуст и поля нет вовсе. Ограничение в форме —
 * удобство; настоящий зажим стоит в экшенах и при чтении.
 */
export function ItemVisibilityField({
  defaultValue = "PARTICIPANTS",
  options,
}: {
  defaultValue?: TripItemVisibilityValue;
  options: readonly TripItemVisibilityValue[];
}) {
  const t = useT();
  if (options.length === 0) return null;
  // Прежнее значение могло быть шире нынешнего потолка (поездку закрыли
  // после того, как запись стала публичной) — тогда отмечаем верхний
  // доступный вариант, ровно то, что зритель и видит.
  const current = options.includes(defaultValue) ? defaultValue : options[options.length - 1];
  // Почему вариантов меньше четырёх — по самому открытому из них.
  const cappedBy = options.includes("PUBLIC")
    ? null
    : options.includes("FRIENDS")
      ? t.trips.itemVisibility.cappedBy.FRIENDS
      : t.trips.itemVisibility.cappedBy.PRIVATE;
  return (
    <div>
      <label className="form-label small text-secondary d-block mb-1">
        {t.trips.itemVisibility.label}
      </label>
      <div className="d-flex flex-column gap-1">
        {options.map((value) => (
          <label key={value} className="form-check mb-0">
            <input
              type="radio"
              name="visibility"
              value={value}
              defaultChecked={value === current}
              className="form-check-input"
            />
            <span className="form-check-label small">
              {t.trips.itemVisibility.options[value]}{" "}
              <span className="text-secondary">— {t.trips.itemVisibility.hints[value]}</span>
            </span>
          </label>
        ))}
      </div>
      {cappedBy && <p className="small text-secondary mb-0 mt-1">{cappedBy}</p>}
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
