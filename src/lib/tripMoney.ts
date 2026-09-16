/**
 * Деньги поездки: разбор ввода, форматирование, итоги.
 *
 * Всё чистое и без базы — те же функции нужны форме, странице, итогам и
 * тесту.
 *
 * ГЛАВНОЕ ПРАВИЛО: сумма живёт ЦЕЛЫМ ЧИСЛОМ МИНОРНЫХ ЕДИНИЦ (сатанги,
 * копейки, центы). Дробные деньги в double дают 0.1 + 0.2 =
 * 0.30000000000000004, и итог по сотне строк уезжает в копейках без
 * всякой причины. У всех четырёх валют ровно два знака после запятой,
 * поэтому множитель один на всех.
 *
 * Пересчёта между валютами тут НЕТ и не будет по умолчанию: живой курс
 * тянуть неоткуда (сервисы курсов в РФ работают через раз — то самое
 * ограничение, из-за которого отказались от Cloudflare), а выдуманный
 * курс врал бы в итогах. Поэтому итоги считаются ПО КАЖДОЙ ВАЛЮТЕ
 * отдельно, и бюджет сравнивается со своей валютой.
 */

/** Валюты трат (решение владельца 2026-09-16). */
export const TRIP_CURRENCIES = ["THB", "RUB", "BYN", "USD"] as const;
export type TripCurrencyValue = (typeof TRIP_CURRENCIES)[number];

/** Порядок категорий в разбивке — от крупных трат к мелким. */
export const EXPENSE_CATEGORIES = [
  "FLIGHT",
  "STAY",
  "TICKETS",
  "FOOD",
  "TRANSPORT",
  "SHOPPING",
  "OTHER",
] as const;
export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number];

/** Значок категории. Подписи — в словаре, значки одинаковы на обоих
 *  языках, и держать их там незачем. */
export const CATEGORY_EMOJI: Record<ExpenseCategoryValue, string> = {
  FLIGHT: "✈️",
  STAY: "🏨",
  TICKETS: "🎫",
  FOOD: "🍜",
  TRANSPORT: "🚕",
  SHOPPING: "🛍️",
  OTHER: "💸",
};

/** Сколько минорных единиц в одной основной. У всех четырёх валют — 100. */
const MINOR = 100;

/** Мусор из адреса или формы — это «бат», а не ошибка на весь экран. */
export function parseCurrency(raw: string | undefined): TripCurrencyValue {
  return (TRIP_CURRENCIES as readonly string[]).includes(raw ?? "")
    ? (raw as TripCurrencyValue)
    : "THB";
}

export function parseCategory(raw: string | undefined): ExpenseCategoryValue {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(raw ?? "")
    ? (raw as ExpenseCategoryValue)
    : "OTHER";
}

/**
 * Введённая руками сумма → минорные единицы. `null` — ввод не похож на
 * деньги, и форма обязана сказать об этом, а не молча записать ноль.
 *
 * Терпим то, как люди правда пишут: «1 200,50», «1200.5», «1 200 ฿»,
 * неразрывные пробелы из скопированного текста. Не терпим ноль и минус:
 * трата на ноль бессмысленна, а отрицательная — это возврат, для
 * которого нужен свой разговор, а не тихо принятый минус.
 */
export function parseAmount(raw: string): number | null {
  // Минус ловим ДО чистки: ниже он срезается вместе с валютными
  // знаками, и «-500» молча превращалось в трату на 500 (поймано
  // тестом). Возврат — это отдельный разговор, а не тихий минус.
  if (/[-\u2212]/.test(raw)) return null;
  const cleaned = raw
    .replace(/[\s  ]/g, "")
    .replace(",", ".")
    // Всё, что не цифра и не точка: валютные знаки, буквы.
    .replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  // Две точки — это не число, а опечатка; молча брать первую нельзя.
  if ((cleaned.match(/\./g) ?? []).length > 1) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  const minor = Math.round(value * MINOR);
  if (minor <= 0) return null;
  // Потолок — миллиард в минорных единицах: столбец INTEGER, и
  // случайно вставленный телефон не должен ронять запрос.
  if (minor > 2_000_000_000) return null;
  return minor;
}

/** Минорные единицы → строка для поля правки («1200.50» без разделителей
 *  разрядов: в input их быть не должно, иначе следующий разбор споткнётся). */
export function amountToInput(minor: number): string {
  return (minor / MINOR).toFixed(2).replace(/\.00$/, "");
}

/** Сумма для показа: «1 200,50 ฿». Локаль решает разделители, валюта —
 *  знак; Intl знает и то и другое, свой словарь знаков не нужен. */
export function formatMoney(
  minor: number,
  currency: TripCurrencyValue,
  locale: string,
): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency,
    // Копейки показываем, только если они есть: «1 200 ฿» читается
    // легче, чем «1 200,00 ฿», а в мелких тратах центы важны.
    minimumFractionDigits: minor % MINOR === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / MINOR);
}

export type ExpenseLike = {
  amountMinor: number;
  currency: TripCurrencyValue;
  category: ExpenseCategoryValue;
};

/** Итог по каждой валюте, от большей суммы к меньшей. Валюты, которых в
 *  тратах нет, в ответе не появляются — пустых строк «0 ฿» быть не должно. */
export function totalsByCurrency(
  expenses: ExpenseLike[],
): { currency: TripCurrencyValue; total: number }[] {
  const byCurrency = new Map<TripCurrencyValue, number>();
  for (const e of expenses) {
    byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + e.amountMinor);
  }
  return [...byCurrency.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency));
}

/**
 * Разбивка по категориям ВНУТРИ одной валюты. Внутри — потому что
 * складывать баты с рублями нельзя, а «еда: 3000 ฿ и 500 ₽» в одной
 * строке ничего не объясняет.
 *
 * `share` — доля от итога этой валюты, 0..1: по ней рисуется полоса.
 */
export function byCategory(
  expenses: ExpenseLike[],
  currency: TripCurrencyValue,
): { category: ExpenseCategoryValue; total: number; share: number }[] {
  const mine = expenses.filter((e) => e.currency === currency);
  const total = mine.reduce((sum, e) => sum + e.amountMinor, 0);
  if (total === 0) return [];
  const byCat = new Map<ExpenseCategoryValue, number>();
  for (const e of mine) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountMinor);
  return EXPENSE_CATEGORIES.flatMap((category) => {
    const sum = byCat.get(category);
    return sum ? [{ category, total: sum, share: sum / total }] : [];
  }).sort((a, b) => b.total - a.total);
}

/**
 * Бюджет: сколько потрачено из запланированного, В СВОЕЙ ВАЛЮТЕ.
 *
 * `share` ограничен единицей — полоса не должна вылезать за дорожку;
 * перерасход виден по `over`, а не по сломанной вёрстке.
 */
export function budgetProgress(
  spentMinor: number,
  budgetMinor: number,
): { share: number; over: number } {
  if (budgetMinor <= 0) return { share: 0, over: 0 };
  return {
    share: Math.min(1, spentMinor / budgetMinor),
    over: Math.max(0, spentMinor - budgetMinor),
  };
}
