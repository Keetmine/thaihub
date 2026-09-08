/** Геометрия на координатах локаций (блок «Рядом с этим местом»,
 *  «Маршрут дня» в поездке).
 *
 *  Считаем в JS, а не в SQL: локаций с координатами сотни, а не
 *  миллионы, поэтому кандидатов сначала грубо режем прямоугольником по
 *  широте/долготе в Prisma-запросе, а точное расстояние и сортировку
 *  добираем здесь — без сырого SQL и расширений типа PostGIS.
 */

export type GeoPoint = { latitude: number; longitude: number };

/** Метров в одном градусе широты (и долготы на экваторе). */
const METERS_PER_DEGREE = 111_320;

/** Расстояние между двумя точками в метрах (гаверсинус). */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  // 6 371 000 — средний радиус Земли в метрах.
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Прямоугольник «радиус N км вокруг точки» для where-условия Prisma:
 *  дешёвый первичный отбор, точный отсев — distanceMeters. Долготный
 *  шаг растягивается с широтой (cos φ); Math.max страхует от деления
 *  на ноль у полюсов — для Таиланда это чистая формальность. */
export function boundingBox(center: GeoPoint, radiusKm: number) {
  const latDelta = (radiusKm * 1000) / METERS_PER_DEGREE;
  const lngDelta =
    (radiusKm * 1000) /
    (METERS_PER_DEGREE * Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01));
  return {
    latitude: { gte: center.latitude - latDelta, lte: center.latitude + latDelta },
    longitude: { gte: center.longitude - lngDelta, lte: center.longitude + lngDelta },
  };
}
