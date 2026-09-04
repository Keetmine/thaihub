import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { invalidateCatalogCache } from "@/lib/catalogCache";
import type { AuditAction, Prisma } from "@/generated/prisma/client";

/** Одно изменившееся поле. from/to уже приведены к строке — история
 *  читается человеком, а не разбирается кодом обратно. */
export type AuditChange = {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
};

/** Русские подписи полей для истории. Поля не из словаря показываются
 *  как есть — словарь дополняется по мере надобности, а не блокирует
 *  логирование новых полей. */
const FIELD_LABELS: Record<string, string> = {
  title: "Название",
  name: "Имя",
  realName: "Реальное имя",
  musicAlias: "Псевдоним",
  slug: "Слаг",
  type: "Тип",
  bio: "Биография",
  synopsis: "Описание",
  description: "Описание",
  photoUrl: "Фото",
  posterUrl: "Постер",
  logoUrl: "Логотип",
  coverUrl: "Обложка",
  birthDate: "Дата рождения",
  placeOfBirth: "Место рождения",
  height: "Рост",
  weight: "Вес",
  year: "Год",
  status: "Статус",
  network: "Канал",
  episodes: "Серий",
  agencyId: "Агентство",
  agencyIds: "Агентства",
  novelId: "Новелла",
  dramaId: "Сериал",
  locationId: "Локация",
  venue: "Площадка",
  presaleAt: "Старт продаж",
  presaleUrl: "Ссылка на продажи",
  ticketPrice: "Цена билета",
  mydramalistUrl: "MyDramaList",
  sourceUrl: "Источник",
  url: "Ссылка",
  address: "Адрес",
  latitude: "Широта",
  longitude: "Долгота",
  city: "Город",
  note: "Пояснение",
  published: "Опубликовано",
  content: "Текст",
  albumId: "Альбом",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Сравнивает снимки записи до и после правки. Сравнение идёт по
 * строковому представлению: из формы всё приходит строками, а из БД —
 * числами и датами, и «2023» vs 2023 иначе попадало бы в историю как
 * изменение при каждом сохранении.
 */
export function diffRecords(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: string[],
): AuditChange[] {
  const keys = fields ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes: AuditChange[] = [];
  for (const field of keys) {
    const from = toText(before[field]);
    const to = toText(after[field]);
    if (from === to) continue;
    changes.push({ field, label: fieldLabel(field), from, to });
  }
  return changes;
}

/**
 * Пишет строку в историю правок. Никогда не роняет вызывающее действие:
 * запись каталога важнее её журнала — упавший лог не должен откатывать
 * успешное сохранение.
 */
export async function logAudit(entry: {
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel: string;
  changes?: AuditChange[];
  note?: string;
}): Promise<void> {
  try {
    // Каждая правка каталога проходит через аудит — удобная центральная
    // точка, чтобы сбросить кэшированные каталожные выборки (sitemap,
    // списки, «выходит сегодня»). Сброс стоит ДО отсева пустых правок:
    // «Сохранить» без изменений — это осознанный жест админа «покажи
    // свежее», и e2e пользуются им как штатной пробивкой кэша. Раньше
    // no-op выходил раньше сброса, и данные, записанные мимо форм
    // (фикстуры, скрипты), было не протолкнуть на витрину до конца TTL.
    invalidateCatalogCache();
    // Пустой UPDATE — это сохранение формы без единой правки; такие
    // строки только зашумляют историю.
    if (entry.action === "UPDATE" && entry.changes && entry.changes.length === 0) return;
    // Скрипты и импорты работают вне HTTP-контекста — там cookies()
    // бросает; такая правка честно записывается как «система».
    const user = await getCurrentUser().catch(() => null);
    await prisma.auditLog.create({
      data: {
        userId: user?.id ?? null,
        userLabel: user?.name ?? user?.email ?? "система",
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityLabel: entry.entityLabel,
        changes: (entry.changes as unknown as Prisma.InputJsonValue) ?? undefined,
        note: entry.note ?? null,
      },
    });
  } catch (error) {
    console.error("audit log failed", error);
  }
}

/** Человеческие названия сущностей для ленты истории. */
export const ENTITY_LABELS: Record<string, string> = {
  Performer: "Исполнитель",
  Agency: "Агентство",
  Drama: "Сериал",
  Event: "Событие",
  Location: "Локация",
  Novel: "Новелла",
  Album: "Альбом",
  Song: "Песня",
  WikiArticle: "Вики-статья",
};

/** Ссылка на карточку записи в админке (для ленты истории). */
export function auditEntityHref(entityType: string, entityId: string): string | null {
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
