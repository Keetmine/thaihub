import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateWithYear } from "@/lib/dates";
import { communityHref, eventHref } from "@/lib/slugHelpers";
import ConfirmForm from "@/components/ConfirmForm";
import StatTile from "@/components/StatTile";
import { TrashIcon } from "@/components/icons";
import { adminDeleteContent, type ModContentType } from "../../moderation/actions";
import { adminDeleteCommunityAndReturn } from "../actions";
import { VisibilityBadge } from "../VisibilityBadge";

export const metadata = { title: "Сообщество" };

export const dynamic = "force-dynamic";

const JOIN_MODE_LABELS: Record<string, string> = {
  OPEN: "вступают свободно",
  APPROVAL: "по одобрению",
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "владелец",
  MODERATOR: "модератор",
  MEMBER: "участник",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "",
  PENDING: "заявка",
  BANNED: "убран",
};

/**
 * Карточка сообщества в админке (АА25, админский этап).
 *
 * Смысл страницы — дать владелице сайта заглянуть внутрь ЛЮБОГО
 * сообщества, включая закрытое, не вступая в него. Публичная страница на
 * это не годится по устройству: там всё содержимое живёт за
 * `canSeeInside`, то есть за участием, а становиться участником, чтобы
 * разобрать жалобу, — значит попасть в список людей и получать
 * уведомления сообщества. Админ здесь смотрит и убирает, но не
 * участвует.
 *
 * Показывается ровно то, за что владелица отвечает перед посторонними:
 * ссылки (за ними обычно закрытый чат), темы, встречи и люди. Точечное
 * удаление — общим `adminDeleteContent`, тем же, что в очереди жалоб.
 */
function DeleteButton({
  type,
  id,
  confirmMessage,
}: {
  type: ModContentType;
  id: string;
  confirmMessage: string;
}) {
  return (
    <ConfirmForm action={adminDeleteContent.bind(null, type, id)} confirmMessage={confirmMessage}>
      <button
        type="button"
        className="icon-btn icon-btn-danger flex-shrink-0"
        aria-label="Удалить"
        data-tooltip="Удалить"
      >
        <TrashIcon />
      </button>
    </ConfirmForm>
  );
}

export default async function AdminCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;

  const community = await prisma.community.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      links: { orderBy: { createdAt: "asc" } },
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      posts: {
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      events: {
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          // Ближайший день встречи — по нему понятно, живая она или из
          // прошлого года.
          occurrences: { select: { startsAt: true }, orderBy: { startsAt: "asc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!community) notFound();

  const active = community.members.filter((m) => m.status === "ACTIVE");

  return (
    <div>
      <Link href="/admin/communities" className="eyebrow text-decoration-none">
        ← Все сообщества
      </Link>

      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mt-3 mb-4">
        <div style={{ minWidth: 0 }}>
          <h1 className="display-1-tight mb-1" style={{ fontSize: "1.9rem" }}>
            {community.title}
            <VisibilityBadge visibility={community.visibility} />
          </h1>
          <p className="small text-secondary mb-0">
            {community.owner ? (
              <Link href={`/admin/users/${community.owner.id}`} className="link-body-emphasis">
                {community.owner.name || community.owner.email || "без имени"}
              </Link>
            ) : (
              "аккаунт владельца удалён"
            )}{" "}
            · {JOIN_MODE_LABELS[community.joinMode] ?? community.joinMode} ·{" "}
            {formatDateWithYear(community.createdAt)}
            {(community.city || community.country) && (
              <> · {[community.city, community.country].filter(Boolean).join(", ")}</>
            )}
          </p>
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <a
            href={communityHref(community)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            На сайте ↗
          </a>
          <ConfirmForm
            action={adminDeleteCommunityAndReturn.bind(null, community.id)}
            confirmMessage={`Удалить сообщество «${community.title}» целиком? Вместе с ним исчезнут его темы, встречи и участники.`}
          >
            <button type="button" className="btn btn-outline-danger btn-sm">
              Удалить сообщество
            </button>
          </ConfirmForm>
        </div>
      </div>

      {community.description && (
        <p className="mb-4" style={{ whiteSpace: "pre-wrap" }}>
          {community.description}
        </p>
      )}

      <div className="d-flex flex-wrap gap-2 mb-4">
        <StatTile value={active.length} label="участников" />
        <StatTile value={community.members.length - active.length} label="заявок и убранных" />
        <StatTile value={community.posts.length} label="тем" />
        <StatTile value={community.events.length} label="встреч" />
        <StatTile value={community.links.length} label="ссылок" />
      </div>

      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <h2 className="section-heading mb-2">Ссылки</h2>
          {community.links.length === 0 ? (
            <p className="small text-secondary">Ссылок нет.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {community.links.map((l) => (
                <div
                  key={l.id}
                  className="surface d-flex align-items-center justify-content-between gap-3 p-3"
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span className="d-block">{l.label}</span>
                    {/* Адрес — текстом, не ссылкой: за ссылкой сообщества
                        как раз и может быть то, ради чего сюда пришли по
                        жалобе, и открывать её случайным кликом незачем. */}
                    <span className="small text-secondary text-break">{l.url}</span>
                  </div>
                  <DeleteButton
                    type="communityLink"
                    id={l.id}
                    confirmMessage={`Удалить ссылку «${l.label}»?`}
                  />
                </div>
              ))}
            </div>
          )}

          <h2 className="section-heading mb-2 mt-4">Участники</h2>
          {community.members.length === 0 ? (
            <p className="small text-secondary">Никого нет.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {community.members.map((m) => (
                <div key={m.userId} className="surface d-flex justify-content-between gap-3 p-3">
                  <span style={{ minWidth: 0 }}>
                    <Link href={`/admin/users/${m.userId}`} className="link-body-emphasis">
                      {m.user.name || m.user.email || "без имени"}
                    </Link>
                  </span>
                  <span className="small text-secondary flex-shrink-0">
                    {[ROLE_LABELS[m.role] ?? m.role, STATUS_LABELS[m.status] ?? m.status]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col-12 col-lg-6">
          <h2 className="section-heading mb-2">Темы</h2>
          {community.posts.length === 0 ? (
            <p className="small text-secondary">Тем нет.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {community.posts.map((p) => (
                <div
                  key={p.id}
                  className="surface d-flex flex-wrap justify-content-between gap-3 p-3"
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="small mb-1">
                      <a
                        href={`${communityHref(community)}/posts/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-body-emphasis"
                      >
                        {p.title || p.text.slice(0, 60) || "без заголовка"} ↗
                      </a>
                      {p.pinned && (
                        <span className="badge rounded-pill text-bg-secondary ms-2">закреп</span>
                      )}
                      {p.isPrivate && (
                        <span className="badge rounded-pill text-bg-secondary ms-2">
                          для участников
                        </span>
                      )}
                    </p>
                    <p className="small text-secondary mb-0">
                      <Link href={`/admin/users/${p.authorId}`} className="link-body-emphasis">
                        {p.author.name || p.author.email || "без имени"}
                      </Link>{" "}
                      · {formatDateWithYear(p.createdAt)}
                    </p>
                    <p className="small mb-0 mt-1" style={{ whiteSpace: "pre-wrap" }}>
                      {p.text.slice(0, 300)}
                      {p.text.length > 300 ? "…" : ""}
                    </p>
                  </div>
                  <DeleteButton
                    type="communityPost"
                    id={p.id}
                    confirmMessage="Удалить тему? Комментарии к ней тоже исчезнут."
                  />
                </div>
              ))}
            </div>
          )}

          <h2 className="section-heading mb-2 mt-4">Встречи</h2>
          {community.events.length === 0 ? (
            <p className="small text-secondary">Встреч нет.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {community.events.map((e) => (
                <div
                  key={e.id}
                  className="surface d-flex flex-wrap justify-content-between gap-3 p-3"
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="small mb-1">
                      <a
                        href={eventHref(e)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-body-emphasis"
                      >
                        {e.title} ↗
                      </a>
                    </p>
                    <p className="small text-secondary mb-0">
                      {e.createdBy ? (
                        <Link href={`/admin/users/${e.createdBy.id}`} className="link-body-emphasis">
                          {e.createdBy.name || e.createdBy.email || "без имени"}
                        </Link>
                      ) : (
                        "автор неизвестен"
                      )}
                      {e.occurrences[0] && <> · {formatDateWithYear(e.occurrences[0].startsAt)}</>}
                      {e.venue && <> · {e.venue}</>}
                    </p>
                  </div>
                  <DeleteButton
                    type="communityMeetup"
                    id={e.id}
                    confirmMessage={`Удалить встречу «${e.title}»?`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
