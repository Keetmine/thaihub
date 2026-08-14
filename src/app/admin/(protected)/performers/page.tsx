import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deletePerformer } from "./actions";
import { deleteAgency } from "../agencies/actions";
import ConfirmForm from "@/components/ConfirmForm";
import AdminPerformerTabs from "@/components/AdminPerformerTabs";
import AlphabetIndexList from "@/components/AlphabetIndexList";
import NameSearchBox from "@/components/NameSearchBox";
import GmmtvSyncButton from "./GmmtvSyncButton";
import { PencilIcon, TrashIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

function AdminPerformerRow({
  performer,
}: {
  performer: { id: string; name: string; photoUrl: string | null; _count: { events: number } };
}) {
  const boundDelete = deletePerformer.bind(null, performer.id);
  return (
    <div className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3">
      <Link
        href={`/admin/performers/${performer.id}/edit`}
        className="stretched-link text-decoration-none d-flex align-items-center gap-3"
        style={{ minWidth: 0 }}
      >
        {performer.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={performer.photoUrl}
            alt=""
            style={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: "2.25rem",
              height: "2.25rem",
              borderRadius: "50%",
              background: "var(--bs-secondary-bg)",
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <span className="font-display fw-medium text-white d-block text-truncate">
            {performer.name}
          </span>
          <p className="small text-secondary mb-0">{performer._count.events} событ.</p>
        </div>
      </Link>
      {/* position-relative + z-2 lifts these controls above the row's
          stretched-link (::after has z-index: 1), so they stay
          individually clickable instead of triggering the row navigation. */}
      <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
        <Link
          href={`/admin/performers/${performer.id}/edit`}
          className="icon-btn"
          aria-label="Редактировать"
          title="Редактировать"
        >
          <PencilIcon />
        </Link>
        <ConfirmForm
          action={boundDelete}
          confirmMessage={`Удалить исполнителя «${performer.name}»?`}
        >
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            aria-label="Удалить"
            title="Удалить"
          >
            <TrashIcon />
          </button>
        </ConfirmForm>
      </div>
    </div>
  );
}

async function AdminAgenciesView({ q }: { q: string }) {
  const agencies = await prisma.agency.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: { _count: { select: { performers: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      {agencies.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Пока нет агентств."}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {agencies.map((a) => {
            const boundDelete = deleteAgency.bind(null, a.id);
            return (
              <div
                key={a.id}
                className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div className="d-flex align-items-center gap-3">
                  {a.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.logoUrl}
                      alt=""
                      style={{
                        width: "2.5rem",
                        height: "2.5rem",
                        borderRadius: "50%",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "2.5rem",
                        height: "2.5rem",
                        borderRadius: "50%",
                        background: "var(--bs-secondary-bg)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <Link
                      href={`/admin/agencies/${a.id}/edit`}
                      className="stretched-link text-decoration-none"
                    >
                      <span className="font-display fw-medium text-white d-block">{a.name}</span>
                    </Link>
                    <p className="small text-secondary mb-0">
                      {a._count.performers} исполнит.
                    </p>
                  </div>
                </div>
                {/* position-relative + z-2 lifts these controls above the
                    row's stretched-link (::after has z-index: 1), so they
                    stay individually clickable instead of triggering the
                    row navigation. */}
                <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/agencies/${a.id}/edit`}
                    className="icon-btn"
                    aria-label="Редактировать"
                    title="Редактировать"
                  >
                    <PencilIcon />
                  </Link>
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить агентство «${a.name}»?`}
                  >
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      aria-label="Удалить"
                      title="Удалить"
                    >
                      <TrashIcon />
                    </button>
                  </ConfirmForm>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default async function AdminPerformersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const { view, q: rawQ } = await searchParams;
  const isBands = view === "bands";
  const isAgencies = view === "agencies";
  const q = (rawQ ?? "").trim();

  const performers = isAgencies
    ? []
    : await prisma.performer.findMany({
        where: {
          type: isBands ? "BAND" : "SOLO",
          ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
        },
        include: { _count: { select: { events: true } } },
        orderBy: { name: "asc" },
      });

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          {isAgencies ? "Агентства" : isBands ? "Группы" : "Актёры"}
        </h1>
        <Link
          href={isAgencies ? "/admin/agencies/new" : "/admin/performers/new"}
          className="btn btn-primary"
        >
          {isAgencies ? "+ Добавить агентство" : "+ Добавить исполнителя"}
        </Link>
      </div>

      <div className="tab-bar-row">
        <AdminPerformerTabs
          active={isAgencies ? "agencies" : isBands ? "bands" : "performers"}
        />
        <NameSearchBox
          action="/admin/performers"
          q={q}
          hiddenFields={isAgencies ? { view: "agencies" } : isBands ? { view: "bands" } : undefined}
          placeholder={isAgencies ? "Поиск по названию…" : "Поиск по имени…"}
          className=""
        />
      </div>

      {!isAgencies && (
        <div className="surface p-3 mb-4">
          <GmmtvSyncButton />
        </div>
      )}

      {isAgencies ? (
        <AdminAgenciesView q={q} />
      ) : (
        <AlphabetIndexList
          items={performers.map((p) => ({ id: p.id, name: p.name, performer: p }))}
          emptyMessage={isBands ? "Пока нет групп." : "Пока нет актёров."}
          renderItem={({ performer }) => <AdminPerformerRow performer={performer} />}
        />
      )}
    </div>
  );
}
