import { prisma } from "@/lib/prisma";
import LetterAvatar from "@/components/LetterAvatar";
import { ENTITY_LABELS, type AuditChange } from "@/lib/audit";
import type { AuditAction } from "@/generated/prisma/client";

export const ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: "создание",
  UPDATE: "правка",
  DELETE: "удаление",
  MERGE: "слияние",
  BULK: "массовое действие",
};

export function formatAuditDate(d: Date): string {
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type AuditRow = {
  id: string;
  userLabel: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel: string;
  changes: unknown;
  note: string | null;
  createdAt: Date;
};

/** Одна строка истории: кто, когда, что сделал и какие поля поменял.
 *  Значения показываются целиком только если короткие — биографию в
 *  ленту разворачивать бессмысленно. */
export function AuditEntry({ row, showEntity = false }: { row: AuditRow; showEntity?: boolean }) {
  const changes = Array.isArray(row.changes) ? (row.changes as AuditChange[]) : [];
  const short = (v: string | null) => {
    if (v === null) return <span className="text-secondary">пусто</span>;
    return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  };

  return (
    <div className="surface p-3 d-flex gap-3">
      <LetterAvatar name={row.userLabel} photoUrl={null} size={2} />
      <div style={{ minWidth: 0 }} className="flex-grow-1">
        <div className="d-flex flex-wrap align-items-baseline gap-2">
          <span className="text-white fw-medium">{row.userLabel}</span>
          <span className={`audit-action audit-action-${row.action.toLowerCase()}`}>
            {ACTION_LABELS[row.action]}
          </span>
          {showEntity && (
            <span className="small text-secondary">
              {ENTITY_LABELS[row.entityType] ?? row.entityType} · {row.entityLabel}
            </span>
          )}
          <span className="small text-secondary ms-auto">{formatAuditDate(row.createdAt)}</span>
        </div>

        {row.note && <p className="small text-secondary mb-0 mt-1">{row.note}</p>}

        {changes.length > 0 && (
          <ul className="audit-changes mt-2 mb-0">
            {changes.map((c) => (
              <li key={c.field}>
                <span className="text-secondary">{c.label}:</span>{" "}
                <span className="audit-from">{short(c.from)}</span>
                <span className="text-secondary"> → </span>
                <span className="audit-to">{short(c.to)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Блок «История правок» на карточке записи. Под формой пустую историю
 *  прячем совсем (у всего, что завели до появления журнала, её нет), а на
 *  отдельной вкладке показываем с пояснением — иначе вкладка выглядит
 *  сломанной. */
export default async function AuditTrail({
  entityType,
  entityId,
  take = 20,
  hideWhenEmpty = false,
}: {
  entityType: string;
  entityId: string;
  take?: number;
  hideWhenEmpty?: boolean;
}) {
  const rows = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take,
  });
  if (rows.length === 0 && hideWhenEmpty) return null;

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <span className="admin-section-title">История правок</span>
        <span className="admin-section-hint">
          {rows.length === 0 ? "пусто" : `последние ${rows.length}`}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="small text-secondary mb-0">
          Правок ещё не было — журнал ведётся с момента появления записи в нём.
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {rows.map((row) => (
            <AuditEntry key={row.id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}
