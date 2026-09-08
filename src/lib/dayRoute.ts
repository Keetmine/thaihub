import { distanceMeters, type GeoPoint } from "./geo";

/** «Маршрут дня» из вкладки «Что посетить»: чистая ссылка на Google
 *  Maps без API-ключей (Maps URLs, /maps/dir/?api=1). Google берёт не
 *  больше 9 промежуточных точек в такой ссылке — отсюда и потолок. */
export const MAX_ROUTE_POINTS = 9;

/** Жадный порядок обхода: стартуем с первой точки списка (как места
 *  идут во вкладке) и каждый раз идём к ближайшей из оставшихся.
 *  Не оптимальный коммивояжёр, но для дневной прогулки по 5–9 местам
 *  даёт разумный маршрут без единого запроса к внешним сервисам. */
function greedyOrder<T extends GeoPoint>(points: T[]): T[] {
  if (points.length <= 2) return points;
  const rest = points.slice(1);
  const ordered = [points[0]];
  while (rest.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    for (let i = 1; i < rest.length; i++) {
      if (distanceMeters(last, rest[i]) < distanceMeters(last, rest[bestIdx])) bestIdx = i;
    }
    ordered.push(rest.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

/** Ссылка маршрута по точкам вкладки. Origin не передаём нарочно:
 *  тогда Google Maps начинает маршрут с текущего положения человека —
 *  ровно то, что нужно «маршруту дня» на месте. Если точек больше
 *  девяти, берём первые девять ПОСЛЕ жадной сортировки и честно
 *  говорим об этом подписью (shown/total — для неё). */
export function buildDayRoute(
  points: GeoPoint[],
): { url: string; shown: number; total: number } | null {
  if (points.length < 2) return null;
  const ordered = greedyOrder([...points]).slice(0, MAX_ROUTE_POINTS);
  const coord = (p: GeoPoint) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
  const destination = ordered[ordered.length - 1];
  const waypoints = ordered.slice(0, -1);
  const url =
    "https://www.google.com/maps/dir/?api=1" +
    `&destination=${encodeURIComponent(coord(destination))}` +
    (waypoints.length > 0
      ? `&waypoints=${encodeURIComponent(waypoints.map(coord).join("|"))}`
      : "");
  return { url, shown: ordered.length, total: points.length };
}
