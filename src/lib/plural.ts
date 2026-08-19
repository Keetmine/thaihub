/**
 * Русские числительные: «1 артист», «2 артиста», «5 артистов».
 * Счётчики в профиле подписывались одной формой на все числа — при
 * единице получалось «1 любимых артистов».
 */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

/** «5 событий» — число вместе с согласованным словом. */
export function pluralized(n: number, forms: [string, string, string]): string {
  return `${n} ${plural(n, forms)}`;
}
