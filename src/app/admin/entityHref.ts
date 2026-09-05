/**
 * Ссылки на карточки записей в админке — для кнопки «открыть» у
 * выбранного значения в `EntitySelect` / `EntityMultiSelect`.
 *
 * Маршруты те же, что у `auditEntityHref` в `src/lib/audit.ts` (лента
 * истории правок). Отдельный модуль, а не импорт оттуда, потому что
 * `audit.ts` тянет prisma и `getCurrentUser`, а формы админки —
 * клиентские компоненты: серверный модуль в их бандл попасть не должен.
 * Меняются маршруты — правим оба места.
 *
 * Сущности без своей страницы в админке (пейринги, альбомы) ссылки не
 * получают: функция возвращает null, и селект просто не рисует «открыть».
 */
export type AdminEntityType =
  | "Performer"
  | "Agency"
  | "Drama"
  | "Event"
  | "Location"
  | "Novel"
  | "WikiArticle";

export function adminEntityHref(entityType: AdminEntityType, entityId: string): string | null {
  if (!entityId) return null;
  switch (entityType) {
    case "Performer":
      return `/admin/performers/${entityId}/edit`;
    case "Agency":
      return `/admin/agencies/${entityId}/edit`;
    case "Drama":
      return `/admin/dramas/${entityId}/edit`;
    case "Event":
      return `/admin/events/${entityId}/edit`;
    case "Location":
      return `/admin/locations/${entityId}/edit`;
    case "Novel":
      return `/admin/novels/${entityId}/edit`;
    case "WikiArticle":
      return `/admin/wiki/${entityId}/edit`;
    default:
      return null;
  }
}

// Готовой обёртки-функции здесь НЕТ намеренно: селекты принимают вид
// записи строкой (`hrefKind="Drama"`) и строят адрес сами. Функцию в
// них передать нельзя — те же селекты стоят в серверных компонентах
// (/admin/imports), а функция через границу RSC не проходит: страница
// падала в «Раздел не открылся».
