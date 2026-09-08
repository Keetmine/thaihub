import type { LocationCategory } from "@/generated/prisma/client";

// Категории мест: подписи и иконки в одном месте — по ним строятся
// фильтры в списках, значки на карточках и выбор в админке.
export const LOCATION_CATEGORIES: {
  value: LocationCategory;
  label: string;
  emoji: string;
}[] = [
  { value: "CAFE", label: "Кафе", emoji: "☕️" },
  { value: "RESTAURANT", label: "Ресторан", emoji: "🍽" },
  { value: "SHOP", label: "Магазин", emoji: "🛍" },
  { value: "MALL", label: "Торговый центр", emoji: "🏬" },
  { value: "HOTEL", label: "Отель", emoji: "🏨" },
  { value: "PHOTO_SPOT", label: "Фотозона", emoji: "📸" },
  { value: "LANDMARK", label: "Достопримечательность", emoji: "🏛" },
  { value: "PARK", label: "Парк", emoji: "🌳" },
  { value: "TRANSPORT", label: "Транспорт", emoji: "🚉" },
  { value: "OTHER", label: "Другое", emoji: "📍" },
];

const BY_VALUE = new Map(LOCATION_CATEGORIES.map((c) => [c.value, c]));

export function categoryEmoji(value: LocationCategory | null | undefined): string | null {
  return value ? (BY_VALUE.get(value)?.emoji ?? null) : null;
}

export function isLocationCategory(value: string): value is LocationCategory {
  return BY_VALUE.has(value as LocationCategory);
}
