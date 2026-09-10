/**
 * Подпись пейринга — «Zee × NuNew» или собственное имя пары.
 *
 * Одним помощником, а не строкой в каждом месте: подпись собиралась
 * копипастой в семи файлах (админка пейрингов, форма события, форма
 * исполнителя, страницы артиста и события), и порядок имён в ней должен
 * быть ОДИН И ТОТ ЖЕ везде — тот, что записан в самом пейринге
 * (правка владельца 2026-09-10).
 *
 * Чистый модуль без обращений к базе: подпись нужна и серверным
 * страницам, и клиентским формам админки.
 */

/** Минимум, из которого собирается подпись. */
export type PairingLabelSource = {
  /** Своё имя пары (АА3) — если есть, оно и есть подпись. */
  name?: string | null;
  performerA: { name: string };
  performerB: { name: string };
};

/** «Zee × NuNew». Порядок — из пейринга, менять его нельзя. */
export function pairingNames(pair: PairingLabelSource): string {
  return `${pair.performerA.name} × ${pair.performerB.name}`;
}

/** Своё имя пары, если задано, иначе «Zee × NuNew». */
export function pairingLabel(pair: PairingLabelSource): string {
  return pair.name?.trim() || pairingNames(pair);
}
