import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { ENTITY_LABELS, auditEntityHref } from "@/lib/audit";
import { AuditEntry } from "@/components/admin/AuditTrail";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";

export const metadata = { title: "История правок" };

export const dynamic = "force-dynamic";

const ENTITY_TABS = ["Performer", "Drama", "Event", "Agency", "Location", "Novel"] as const;

/** Общая лента правок каталога: кто что менял за всё время. Точечная
 *  история конкретной записи живёт на её карточке (AuditTrail). */
export default async function AdminHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; user?: string; page?: string }>;
}) {
  await requireCatalogEditor();
  const { type, user: userId, page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const where = {
    ...(type && ENTITY_TABS.includes(type as (typeof ENTITY_TABS)[number]) ? { entityType: type } : {}),
    ...(userId ? { userId } : {}),
  };

  const [rows, total, editors] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { OR: [{ isAdmin: true }, { isManager: true }] },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const buildHref = (next: { type?: string | null; user?: string | null; page?: number }) => {
    const params = new URLSearchParams();
    const t = next.type === undefined ? type : next.type;
    const u = next.user === undefined ? userId : next.user;
    if (t) params.set("type", t);
    if (u) params.set("user", u);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    return `/admin/history${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          История правок
        </h1>
        <span className="small text-secondary">{total} записей</span>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Link href={buildHref({ type: null, page: 1 })} className={`nav-chip ${!type ? "is-active" : ""}`}>
          Всё
        </Link>
        {ENTITY_TABS.map((t) => (
          <Link key={t} href={buildHref({ type: t, page: 1 })} className={`nav-chip ${type === t ? "is-active" : ""}`}>
            {ENTITY_LABELS[t] ?? t}
          </Link>
        ))}
      </div>

      {editors.length > 1 && (
        <div className="d-flex flex-wrap gap-2 mb-4">
          <Link href={buildHref({ user: null, page: 1 })} className={`nav-chip ${!userId ? "is-active" : ""}`}>
            Все авторы
          </Link>
          {editors.map((e) => (
            <Link
              key={e.id}
              href={buildHref({ user: e.id, page: 1 })}
              className={`nav-chip ${userId === e.id ? "is-active" : ""}`}
            >
              {e.name ?? e.email ?? "без имени"}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-secondary">Правок пока нет.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {rows.map((row) => {
            const href = auditEntityHref(row.entityType, row.entityId);
            const entry = <AuditEntry row={row} showEntity />;
            // На удалённую запись ссылаться некуда — карточки больше нет.
            return href && row.action !== "DELETE" ? (
              <Link key={row.id} href={href} className="text-decoration-none audit-link">
                {entry}
              </Link>
            ) : (
              <div key={row.id}>{entry}</div>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPagesFor(total)} buildHref={(p) => buildHref({ page: p })} />
    </div>
  );
}
