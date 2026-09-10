import type { Locale } from "@/lib/i18n/config";

/**
 * Переводы УНИКАЛЬНЫХ текстов каталога: био артиста, описание локации,
 * анонс события. В отличие от словаря повторяющихся значений
 * (`contentDictionary.ts`), каждый такой текст свой и переводится у
 * своей записи.
 *
 * Хранятся ОДНОЙ json-колонкой `translations` на сущность:
 * `{ ru: { bio: "…", trivia: ["…"] } }`. Колонка на поле (как
 * `Drama.titleRu`) не годится — переводимых полей у артиста восемь, у
 * события четыре, половина из них массивы, и каждое новое требовало бы
 * миграции. Здесь и форма админки, и читалка работают по одному
 * объявлению ниже.
 *
 * Имена и названия артистов сюда НЕ входят (решение владельца
 * 2026-09-10: «имена оставляем латиницей») — фанаты знают их латиницей,
 * а поиск и алфавитный указатель остаются как есть.
 *
 * Сериалы живут отдельно: у них `titleRu`/`synopsisRu` заведены раньше,
 * заполняются импортом с dorama.land и читаются через `lib/dramaLocale`.
 */

/** Как поле выглядит в форме и что с ним делать при чтении. */
export type TranslatableKind = "line" | "text" | "list";

export type TranslatableField = {
  /** Имя поля модели: и ключ перевода, и откуда берётся оригинал. */
  name: string;
  /** Подпись в админке. Админка одноязычная, русская. */
  label: string;
  kind: TranslatableKind;
};

export type TranslatableEntity = "performer" | "event" | "location" | "novel" | "agency";

/**
 * Что переводим у каждой сущности.
 *
 * Списка «всё подряд» тут нет намеренно: ссылки, адреса площадок,
 * названия агентств и имена — не тексты, а данные, и перевод им либо не
 * нужен, либо вреден (ссылка перестанет открываться, имя перестанет
 * находиться поиском).
 */
export const TRANSLATABLE_FIELDS: Record<TranslatableEntity, TranslatableField[]> = {
  performer: [
    { name: "bio", label: "Биография", kind: "text" },
    { name: "placeOfBirth", label: "Место рождения", kind: "line" },
    { name: "trivia", label: "Факты", kind: "list" },
    { name: "mvAppearances", label: "Клипы", kind: "list" },
    { name: "soloDebut", label: "Сольный дебют", kind: "line" },
  ],
  event: [
    { name: "title", label: "Название", kind: "line" },
    { name: "description", label: "Описание", kind: "text" },
    { name: "venue", label: "Площадка", kind: "line" },
  ],
  location: [
    { name: "name", label: "Название", kind: "line" },
    { name: "description", label: "Описание", kind: "text" },
  ],
  novel: [
    { name: "title", label: "Название", kind: "line" },
    { name: "description", label: "Описание", kind: "text" },
  ],
  agency: [{ name: "description", label: "Описание", kind: "text" }],
};

/** Значение перевода: строка или список строк — по виду поля. */
type TranslationValue = string | string[];

/** Содержимое колонки `translations`. */
export type EntityTranslations = Partial<Record<Locale, Record<string, TranslationValue>>>;

/**
 * Разбор колонки. Json из Prisma приходит как `unknown`, и доверять ему
 * нельзя: строку туда мог положить старый код или ручная правка базы.
 */
export function parseTranslations(raw: unknown): EntityTranslations {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as EntityTranslations;
}

/**
 * Текст поля на языке зрителя: перевод, если он есть, иначе оригинал.
 *
 * Подстановка, а не перевод: непереведённое показывается по-английски,
 * как и было. Пустая строка переводом не считается — она значит «ещё не
 * переводили», а не «здесь пусто».
 */
export function translatedText<T extends string | null | undefined>(
  entity: { translations?: unknown },
  field: string,
  original: T,
  locale: Locale,
): T {
  if (locale === "en") return original;
  const value = parseTranslations(entity.translations)[locale]?.[field];
  if (typeof value === "string" && value.trim()) return value as T;
  return original;
}

/** То же для списков (факты, клипы): переводом считается непустой список. */
export function translatedList(
  entity: { translations?: unknown },
  field: string,
  original: string[],
  locale: Locale,
): string[] {
  if (locale === "en") return original;
  const value = parseTranslations(entity.translations)[locale]?.[field];
  if (Array.isArray(value) && value.some((v) => v.trim())) {
    return value.filter((v) => v.trim());
  }
  return original;
}

/**
 * Сколько полей переведено — для пометки в списках админки («2 из 5»).
 * Считается по объявлению, а не по ключам в json: поле могли убрать из
 * списка переводимых, и старый ключ не должен изображать работу.
 */
export function translatedCount(entity: TranslatableEntity, raw: unknown, locale: Locale = "ru"): number {
  const values = parseTranslations(raw)[locale] ?? {};
  return TRANSLATABLE_FIELDS[entity].filter((f) => {
    const v = values[f.name];
    return Array.isArray(v) ? v.some((x) => x.trim()) : typeof v === "string" && !!v.trim();
  }).length;
}
