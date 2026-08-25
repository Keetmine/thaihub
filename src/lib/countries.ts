import type { Locale } from "@/lib/i18n/config";

// Страны для профиля. Список неполный по замыслу: сверху те, откуда
// аудитория, дальше остальные по регионам. Если чьей-то страны не
// хватает — добавляется сюда одной строкой.
//
// Подписи не храним: их даёт Intl.DisplayNames на языке страницы, иначе
// список пришлось бы держать переведённым в каждом словаре и следить,
// чтобы переводы не разъезжались.
export const COUNTRY_CODES = [
  "RU",
  "BY",
  "KZ",
  "UA",
  "TH",
  "AM",
  "GE",
  "KG",
  "UZ",
  "AZ",
  "MD",
  "LV",
  "LT",
  "EE",
  "PL",
  "DE",
  "FR",
  "IT",
  "ES",
  "PT",
  "NL",
  "BE",
  "AT",
  "CH",
  "CZ",
  "SK",
  "HU",
  "RO",
  "BG",
  "RS",
  "HR",
  "GR",
  "TR",
  "CY",
  "IL",
  "AE",
  "GB",
  "IE",
  "SE",
  "NO",
  "FI",
  "DK",
  "IS",
  "US",
  "CA",
  "MX",
  "BR",
  "AR",
  "CL",
  "JP",
  "KR",
  "CN",
  "HK",
  "TW",
  "SG",
  "MY",
  "ID",
  "PH",
  "VN",
  "IN",
  "AU",
  "NZ",
  "ZA",
  "EG",
  "MA",
  "QA",
  "SA",
  "MN",
];

const KNOWN = new Set(COUNTRY_CODES);

// По одному экземпляру на язык: конструктор Intl заметно дороже вызова.
const displayNames = new Map<Locale, Intl.DisplayNames>();

function names(locale: Locale): Intl.DisplayNames {
  let dn = displayNames.get(locale);
  if (!dn) {
    dn = new Intl.DisplayNames([locale], { type: "region" });
    displayNames.set(locale, dn);
  }
  return dn;
}

export function countryLabel(
  code: string | null | undefined,
  locale: Locale = "en",
): string | null {
  if (!code || !KNOWN.has(code)) return null;
  return names(locale).of(code) ?? code;
}

/** Список для <select>, отсортированный по подписи на языке страницы —
 *  кроме первых пяти: они стоят вперёд, потому что оттуда аудитория. */
export function countryOptions(locale: Locale): { code: string; label: string }[] {
  const dn = names(locale);
  const label = (code: string) => dn.of(code) ?? code;
  const pinned = COUNTRY_CODES.slice(0, 5);
  const rest = COUNTRY_CODES.slice(5)
    .map((code) => ({ code, label: label(code) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  return [...pinned.map((code) => ({ code, label: label(code) })), ...rest];
}

export function isKnownCountry(code: string): boolean {
  return KNOWN.has(code);
}
