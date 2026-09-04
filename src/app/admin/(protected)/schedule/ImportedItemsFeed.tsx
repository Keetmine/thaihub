import Link from "next/link";

/**
 * Лента «что именно спарсено» для вкладки задачи: та же идея и разметка,
 * что у «Последнего спарсенного» в /admin/imports, но скромно
 * продублирована, а не импортирована оттуда — у страниц разная жизнь,
 * общий модуль связал бы их правки, а различие уже есть: здесь лента
 * фильтруется по kind прогона, там — общая.
 */

// Куда вести по клику — на админ-редактирование записи.
const ITEM_EDIT_HREF: Record<string, (id: string) => string> = {
  performer: (id) => `/admin/performers/${id}/edit`,
  agency: (id) => `/admin/agencies/${id}/edit`,
  event: (id) => `/admin/events/${id}/edit`,
  drama: (id) => `/admin/dramas/${id}/edit`,
  // У альбомов и песен своей страницы нет — ведём к исполнителям.
  album: () => `/admin/performers`,
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  performer: "исполнитель",
  agency: "агентство",
  event: "событие",
  drama: "сериал",
  album: "альбом",
  song: "песня",
};

export type ImportedItemRow = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  label: string;
  createdAt: Date;
};

export default function ImportedItemsFeed({ items }: { items: ImportedItemRow[] }) {
  const fmt = (d: Date) =>
    d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  if (items.length === 0) {
    return (
      <p className="small text-secondary mb-0">
        Пока пусто — сюда попадает всё, что прогоны задачи создали или обновили
        (альбомы, песни, обложки…).
      </p>
    );
  }

  return (
    <div className="d-flex flex-column gap-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="surface d-flex flex-wrap align-items-center gap-2 px-3 py-2"
        >
          <span className="event-chip">{ITEM_TYPE_LABELS[item.entityType] ?? item.entityType}</span>
          <span className={item.action === "created" ? "text-success small" : "text-secondary small"}>
            {item.action === "created" ? "создан" : "обновлён"}
          </span>
          {ITEM_EDIT_HREF[item.entityType] ? (
            <Link
              href={ITEM_EDIT_HREF[item.entityType](item.entityId)}
              className="link-body-emphasis small text-truncate"
              style={{ minWidth: 0 }}
            >
              {item.label}
            </Link>
          ) : (
            <span className="small text-truncate">{item.label}</span>
          )}
          <span className="small text-secondary ms-auto flex-shrink-0">
            {fmt(item.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
