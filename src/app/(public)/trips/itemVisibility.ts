/**
 * Правило «запись не может быть виднее самой поездки» — одно на формы,
 * на сохранение и на чтение. Модуль намеренно без "use client" и без
 * "use server": его импортируют и клиентские формы, и server actions.
 */

/** Кто видит поездку целиком. Значения повторяют enum `TripVisibility`. */
export type TripVisibilityValue = "PRIVATE" | "FRIENDS" | "PUBLIC";

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
 * Потолок видимости записи в поездке с такой видимостью.
 *
 * У поездки FRIENDS вариант «Все» показывать некому: до страницы дойдут
 * только друзья владельца. У приватной поездки потолок — «участники»,
 * а не «только я»: принятые участники проходят мимо видимости поездки
 * (см. `trips/[id]/page.tsx`) и совместная приватная поездка — обычное
 * дело, ведь PRIVATE стоит у поездки по умолчанию.
 */
export function allowedItemVisibilities(
  tripVisibility: TripVisibilityValue,
): readonly TripItemVisibilityValue[] {
  if (tripVisibility === "PUBLIC") return ITEM_VISIBILITY_ORDER;
  if (tripVisibility === "FRIENDS") return ITEM_VISIBILITY_ORDER.slice(0, 3);
  return ITEM_VISIBILITY_ORDER.slice(0, 2);
}

/**
 * Зажим: значение записи, урезанное видимостью поездки. Зовётся и при
 * сохранении (форму можно обойти), и при чтении — поездку могли закрыть
 * уже после того, как записи внутри стали публичными. Данные при этом не
 * переписываются: вернут поездке прежнюю видимость — вернутся и записи.
 */
export function clampItemVisibility(
  itemVisibility: TripItemVisibilityValue,
  tripVisibility: TripVisibilityValue,
): TripItemVisibilityValue {
  const allowed = allowedItemVisibilities(tripVisibility);
  return allowed.includes(itemVisibility) ? itemVisibility : allowed[allowed.length - 1];
}

/**
 * Варианты для радио-группы в форме. Пустой список — выбирать не из
 * чего, поля в форме нет вовсе: в приватной соло-поездке «только я» и
 * «участники поездки» — одни и те же глаза, владельца. В совместной
 * приватной поездке разница есть (спрятать запись от попутчиков), и
 * выбор остаётся.
 */
export function itemVisibilityChoices(
  tripVisibility: TripVisibilityValue,
  isShared: boolean,
): readonly TripItemVisibilityValue[] {
  if (tripVisibility === "PRIVATE" && !isShared) return [];
  return allowedItemVisibilities(tripVisibility);
}
