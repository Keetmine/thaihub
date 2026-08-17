import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/dates";
import { listHref } from "@/lib/slugHelpers";
import { resolveReport, deleteReport } from "./actions";

export const dynamic = "force-dynamic";

// Очередь модерации: открытые жалобы + лента свежего юзер-контента,
// чтобы неуместное было видно и без жалоб. Точечное удаление контента —
// на карточке пользователя (/admin/users/[id]).
export default async function AdminModerationPage() {
  const [reports, notes, lists, places] = await Promise.all([
    prisma.report.findMany({
      where: { status: "NEW" },
      include: { reporter: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.eventNote.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, slug: true, title: true } },
      },
      orderBy: { id: "desc" },
      take: 15,
    }),
    prisma.placeList.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.location.findMany({
      where: { createdByUserId: { not: null } },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  // ссылки на цели жалоб: подтягиваем названия списков одним запросом
  const listTargets = new Map(
    (
      await prisma.placeList.findMany({
        where: { id: { in: reports.filter((r) => r.targetType === "placeList").map((r) => r.targetId) } },
        select: { id: true, slug: true, title: true },
      })
    ).map((l) => [l.id, l]),
  );

  const userLabel = (u: { id: string; name: string | null; email: string | null } | null) =>
    u ? (
      <Link href={`/admin/users/${u.id}`} className="link-body-emphasis">
        {u.name || u.email}
      </Link>
    ) : (
      <span className="text-secondary">аккаунт удалён</span>
    );

  return (
    <div>
      <span className="eyebrow">Коммьюнити</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Модерация
      </h1>

      <h2 className="section-heading mb-2">Жалобы ({reports.length})</h2>
      {reports.length === 0 ? (
        <p className="small text-secondary mb-4">Открытых жалоб нет.</p>
      ) : (
        <div className="d-flex flex-column gap-2 mb-4">
          {reports.map((r) => {
            const target =
              r.targetType === "placeList" ? (
                listTargets.has(r.targetId) ? (
                  <Link href={listHref(listTargets.get(r.targetId)!)} className="link-body-emphasis">
                    список «{listTargets.get(r.targetId)!.title}»
                  </Link>
                ) : (
                  <span className="text-secondary">список удалён</span>
                )
              ) : r.targetType === "profile" ? (
                <Link href={`/admin/users/${r.targetId}`} className="link-body-emphasis">
                  профиль пользователя
                </Link>
              ) : (
                <span>{r.targetType} {r.targetId}</span>
              );
            return (
              <div key={r.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="small mb-1">
                    Жалоба на {target}{" "}
                    <span className="text-secondary">
                      · от {userLabel(r.reporter)} · {formatShortDate(r.createdAt)}
                    </span>
                  </p>
                  {r.reason && <p className="small text-secondary mb-0">{r.reason}</p>}
                </div>
                <div className="d-flex align-items-start gap-2 flex-shrink-0">
                  <form action={resolveReport.bind(null, r.id)}>
                    <button type="submit" className="btn btn-ghost btn-sm">✓ Решено</button>
                  </form>
                  <form action={deleteReport.bind(null, r.id)}>
                    <button type="submit" className="btn btn-link btn-sm text-secondary">Скрыть</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="section-heading mb-2">Свежие заметки</h2>
      <div className="d-flex flex-column gap-2 mb-4">
        {notes.length === 0 && <p className="small text-secondary mb-0">Нет заметок.</p>}
        {notes.map((n) => (
          <div key={n.id} className="surface p-3">
            <p className="small mb-1">
              {userLabel(n.user)} <span className="text-secondary">→ {n.event.title}</span>
            </p>
            <p className="small text-secondary mb-0">{n.text}</p>
          </div>
        ))}
      </div>

      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <h2 className="section-heading mb-2">Свежие списки мест</h2>
          <div className="d-flex flex-column gap-2">
            {lists.length === 0 && <p className="small text-secondary mb-0">Нет списков.</p>}
            {lists.map((l) => (
              <div key={l.id} className="surface p-3">
                <Link href={listHref(l)} className="link-body-emphasis d-block">
                  {l.title}
                </Link>
                <span className="small text-secondary">
                  {userLabel(l.user)} · {formatShortDate(l.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <h2 className="section-heading mb-2">Свежие свои места</h2>
          <div className="d-flex flex-column gap-2">
            {places.length === 0 && <p className="small text-secondary mb-0">Нет мест.</p>}
            {places.map((loc) => (
              <div key={loc.id} className="surface p-3">
                <span className="d-block">{loc.name}</span>
                <span className="small text-secondary">
                  {userLabel(loc.createdBy)} · {formatShortDate(loc.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
