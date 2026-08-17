import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatShortDate } from "@/lib/dates";
import {
  listHref,
  artistListHref,
  locationHref,
  eventHref,
  dramaHref,
  novelHref,
} from "@/lib/slugHelpers";
import Pagination from "@/components/Pagination";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import {
  resolveReport,
  deleteReport,
  adminDeleteContent,
  adminUpdateContentText,
  type ModContentType,
} from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const TABS = [
  { key: "reports", label: "Жалобы" },
  { key: "reviews", label: "Отзывы" },
  { key: "comments", label: "Комментарии" },
  { key: "notes", label: "Заметки" },
  { key: "placeLists", label: "Списки мест" },
  { key: "artistLists", label: "Списки актёров" },
  { key: "places", label: "Свои места" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function UserLink({ u }: { u: { id: string; name: string | null; email: string | null } | null }) {
  return u ? (
    <Link href={`/admin/users/${u.id}`} className="link-body-emphasis">
      {u.name || u.email}
    </Link>
  ) : (
    <span className="text-secondary">аккаунт удалён</span>
  );
}

/** Ссылка «на ресурс» — публичная страница, где живёт контент (в новой
 *  вкладке). */
function OpenOnSite({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-ghost btn-sm flex-shrink-0"
    >
      Открыть ↗
    </a>
  );
}

/** Правка текста + удаление — общий хвост карточки контента. */
function ContentControls({
  type,
  id,
  text,
  editable = true,
}: {
  type: ModContentType;
  id: string;
  text?: string;
  editable?: boolean;
}) {
  return (
    <>
      {editable && text !== undefined && (
        <details className="w-100 mt-2">
          <summary className="small text-secondary" style={{ cursor: "pointer" }}>
            Редактировать текст
          </summary>
          <form
            action={adminUpdateContentText.bind(null, type, id)}
            className="d-flex flex-column gap-2 mt-2"
          >
            <textarea name="text" rows={3} defaultValue={text} className="form-control form-control-sm" />
            <button type="submit" className="btn btn-primary btn-sm align-self-start">
              Сохранить
            </button>
          </form>
        </details>
      )}
    </>
  );
}

function DeleteContentButton({ type, id }: { type: ModContentType; id: string }) {
  return (
    <ConfirmForm action={adminDeleteContent.bind(null, type, id)} confirmMessage="Удалить контент?">
      <button type="button" className="icon-btn icon-btn-danger flex-shrink-0" aria-label="Удалить">
        <TrashIcon />
      </button>
    </ConfirmForm>
  );
}

/** Куда ведёт отзыв/комментарий: страница сериала/новеллы/события. */
function targetHref(item: {
  drama: { slug: string | null; id: string; title: string } | null;
  novel: { slug: string | null; id: string; title: string } | null;
  event: { slug: string | null; id: string; title: string } | null;
}): { href: string; label: string } | null {
  if (item.drama) return { href: dramaHref(item.drama), label: item.drama.title };
  if (item.novel) return { href: novelHref(item.novel), label: item.novel.title };
  if (item.event) return { href: eventHref(item.event), label: item.event.title };
  return null;
}

const userSelect = { select: { id: true, name: true, email: true } } as const;
const targetInclude = {
  drama: { select: { id: true, slug: true, title: true } },
  novel: { select: { id: true, slug: true, title: true } },
  event: { select: { id: true, slug: true, title: true } },
} as const;

// Очередь модерации: жалобы + весь юзер-контент по табам с пагинацией.
// У каждой карточки — автор, ссылка на публичную страницу (новая
// вкладка), удаление и (для текстов) правка на месте.
export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { tab: rawTab, page: rawPage } = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === rawTab)?.key ?? "reports") as TabKey;
  const page = Math.max(1, Number(rawPage) || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const pageArgs = { skip, take: PAGE_SIZE };

  const [reportCount, counts] = await Promise.all([
    prisma.report.count({ where: { status: "NEW" } }),
    Promise.all([
      prisma.review.count(),
      prisma.comment.count(),
      prisma.eventNote.count(),
      prisma.placeList.count(),
      prisma.performerList.count(),
      prisma.location.count({ where: { createdByUserId: { not: null } } }),
    ]),
  ]);
  const countByTab: Record<TabKey, number> = {
    reports: reportCount,
    reviews: counts[0],
    comments: counts[1],
    notes: counts[2],
    placeLists: counts[3],
    artistLists: counts[4],
    places: counts[5],
  };
  const totalPages = Math.max(1, Math.ceil(countByTab[tab] / PAGE_SIZE));
  const buildHref = (p: number) => `/admin/moderation?tab=${tab}&page=${p}`;

  let body: React.ReactNode;

  if (tab === "reports") {
    const reports = await prisma.report.findMany({
      where: { status: "NEW" },
      include: { reporter: userSelect },
      orderBy: { createdAt: "desc" },
      ...pageArgs,
    });
    const listTargets = new Map(
      (
        await prisma.placeList.findMany({
          where: { id: { in: reports.filter((r) => r.targetType === "placeList").map((r) => r.targetId) } },
          select: { id: true, slug: true, title: true },
        })
      ).map((l) => [l.id, l]),
    );
    body = reports.length === 0 ? (
      <p className="small text-secondary">Открытых жалоб нет.</p>
    ) : (
      <div className="d-flex flex-column gap-2">
        {reports.map((r) => {
          const target =
            r.targetType === "placeList" ? (
              listTargets.has(r.targetId) ? (
                <a
                  href={listHref(listTargets.get(r.targetId)!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-body-emphasis"
                >
                  список «{listTargets.get(r.targetId)!.title}» ↗
                </a>
              ) : (
                <span className="text-secondary">список удалён</span>
              )
            ) : r.targetType === "profile" ? (
              <Link href={`/admin/users/${r.targetId}`} className="link-body-emphasis">
                профиль пользователя
              </Link>
            ) : (
              <span>
                {r.targetType} {r.targetId}
              </span>
            );
          return (
            <div key={r.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="small mb-1">
                  Жалоба на {target}{" "}
                  <span className="text-secondary">
                    · от <UserLink u={r.reporter} /> · {formatShortDate(r.createdAt)}
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
    );
  } else if (tab === "reviews" || tab === "comments") {
    const isReview = tab === "reviews";
    const items = isReview
      ? await prisma.review.findMany({
          include: { user: userSelect, ...targetInclude },
          orderBy: { createdAt: "desc" },
          ...pageArgs,
        })
      : await prisma.comment.findMany({
          include: { user: userSelect, ...targetInclude },
          orderBy: { createdAt: "desc" },
          ...pageArgs,
        });
    body = items.length === 0 ? (
      <p className="small text-secondary">Пока пусто.</p>
    ) : (
      <div className="d-flex flex-column gap-2">
        {items.map((item) => {
          const target = targetHref(item);
          return (
            <div key={item.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="small mb-1">
                  <UserLink u={item.user} />{" "}
                  {"rating" in item && (
                    <span className="fw-semibold">{(item as { rating: number }).rating}/10</span>
                  )}{" "}
                  <span className="text-secondary">
                    → {target?.label ?? "объект удалён"} · {formatShortDate(item.createdAt)}
                  </span>
                </p>
                <p className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>{item.text}</p>
                <ContentControls type={isReview ? "review" : "comment"} id={item.id} text={item.text} />
              </div>
              <div className="d-flex align-items-start gap-2 flex-shrink-0">
                {target && <OpenOnSite href={target.href} />}
                <DeleteContentButton type={isReview ? "review" : "comment"} id={item.id} />
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (tab === "notes") {
    const notes = await prisma.eventNote.findMany({
      include: {
        user: userSelect,
        event: { select: { id: true, slug: true, title: true } },
      },
      orderBy: { id: "desc" },
      ...pageArgs,
    });
    body = notes.length === 0 ? (
      <p className="small text-secondary">Нет заметок.</p>
    ) : (
      <div className="d-flex flex-column gap-2">
        {notes.map((n) => (
          <div key={n.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="small mb-1">
                <UserLink u={n.user} />{" "}
                <span className="text-secondary">→ {n.event.title} · {n.visibility}</span>
              </p>
              <p className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>{n.text}</p>
              <ContentControls type="note" id={n.id} text={n.text} />
            </div>
            <div className="d-flex align-items-start gap-2 flex-shrink-0">
              <OpenOnSite href={eventHref(n.event)} />
              <DeleteContentButton type="note" id={n.id} />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (tab === "placeLists" || tab === "artistLists") {
    const isPlaces = tab === "placeLists";
    const lists = isPlaces
      ? await prisma.placeList.findMany({
          include: { user: userSelect, _count: { select: { items: true } } },
          orderBy: { createdAt: "desc" },
          ...pageArgs,
        })
      : await prisma.performerList.findMany({
          include: { user: userSelect, _count: { select: { items: true } } },
          orderBy: { createdAt: "desc" },
          ...pageArgs,
        });
    body = lists.length === 0 ? (
      <p className="small text-secondary">Нет списков.</p>
    ) : (
      <div className="d-flex flex-column gap-2">
        {lists.map((l) => (
          <div key={l.id} className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3">
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="d-block">{l.title} <span className="small text-secondary">({l._count.items})</span></span>
              <span className="small text-secondary">
                <UserLink u={l.user} /> · {formatShortDate(l.createdAt)} · {l.visibility}
              </span>
            </div>
            <div className="d-flex align-items-center gap-2 flex-shrink-0">
              <OpenOnSite href={isPlaces ? listHref(l) : artistListHref(l)} />
              <DeleteContentButton type={isPlaces ? "placeList" : "artistList"} id={l.id} />
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    const places = await prisma.location.findMany({
      where: { createdByUserId: { not: null } },
      include: { createdBy: userSelect },
      orderBy: { createdAt: "desc" },
      ...pageArgs,
    });
    body = places.length === 0 ? (
      <p className="small text-secondary">Нет мест.</p>
    ) : (
      <div className="d-flex flex-column gap-2">
        {places.map((loc) => (
          <div key={loc.id} className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3">
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="d-block">{loc.name}</span>
              <span className="small text-secondary">
                <UserLink u={loc.createdBy} /> · {formatShortDate(loc.createdAt)}
              </span>
            </div>
            <div className="d-flex align-items-center gap-2 flex-shrink-0">
              <OpenOnSite href={locationHref(loc)} />
              <DeleteContentButton type="place" id={loc.id} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <span className="eyebrow">Коммьюнити</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Модерация
      </h1>

      <div className="tab-bar mb-4 flex-wrap">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/moderation?tab=${t.key}`}
            prefetch={false}
            className={`tab-bar-item ${tab === t.key ? "active" : ""}`}
          >
            {t.label} ({countByTab[t.key]})
          </Link>
        ))}
      </div>

      {body}

      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  );
}
