import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateWithYear } from "@/lib/dates";
import { communityHref } from "@/lib/slugHelpers";
import { adminListHref } from "@/lib/adminListHref";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import NameSearchBox from "@/components/NameSearchBox";
import Pagination from "@/components/Pagination";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import { adminDeleteContent } from "../moderation/actions";
import { VisibilityBadge } from "./VisibilityBadge";

export const metadata = { title: "Сообщества" };

export const dynamic = "force-dynamic";

/**
 * Сообщества глазами админки (АА25, админский этап).
 *
 * Раздела не было вовсе, и это была дыра, а не недоделка: сообщества —
 * чужой контент на домене владелицы, а закрытые не видны ни в витрине,
 * ни в поиске, ни в карте сайта. Узнать, что они вообще есть, было
 * неоткуда — разве что по жалобе на тему внутри.
 *
 * Поэтому список ВСЕХ, включая закрытые, и по каждому сразу то, по чему
 * решают, идти ли смотреть: кто завёл, сколько людей, сколько разговоров
 * и встреч, когда появилось.
 */
const VISIBILITY_TABS = [
  { key: "all", label: "Все" },
  { key: "PUBLIC", label: "Открытые" },
  { key: "PRIVATE", label: "Закрытые" },
] as const;
type VisibilityTab = (typeof VISIBILITY_TABS)[number]["key"];

export default async function AdminCommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; visibility?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = parsePage(sp.page);
  const visibility: VisibilityTab =
    sp.visibility === "PUBLIC" || sp.visibility === "PRIVATE" ? sp.visibility : "all";

  const where = {
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(visibility === "all" ? {} : { visibility }),
  };

  const [communities, total, publicCount, privateCount] = await Promise.all([
    prisma.community.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        visibility: true,
        joinMode: true,
        createdAt: true,
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { posts: true, events: true } },
      },
      // Новые сверху: в раздел заходят посмотреть, что появилось.
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.community.count({ where }),
    prisma.community.count({ where: { visibility: "PUBLIC" } }),
    prisma.community.count({ where: { visibility: "PRIVATE" } }),
  ]);

  // Участники — только ACTIVE: заявки и убранные не люди сообщества, и
  // «12 участников», где трое из них забанены, врало бы. Отдельным
  // groupBy, а не `_count` со связью: у `_count` нет условия.
  const memberCounts = new Map(
    (
      await prisma.communityMember.groupBy({
        by: ["communityId"],
        where: { communityId: { in: communities.map((c) => c.id) }, status: "ACTIVE" },
        _count: { _all: true },
      })
    ).map((row) => [row.communityId, row._count._all]),
  );

  const totalPages = totalPagesFor(total);

  return (
    <div>
      <span className="eyebrow">Коммьюнити</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Сообщества
        </h1>
        <p className="small text-secondary mb-0">
          открытых: {publicCount} · закрытых: {privateCount}
        </p>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        {VISIBILITY_TABS.map((v) => (
          <Link
            key={v.key}
            href={adminListHref("/admin/communities", sp, {
              visibility: v.key === "all" ? null : v.key,
              page: null,
            })}
            className={v.key === visibility ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <NameSearchBox
        action="/admin/communities"
        q={q}
        hiddenFields={visibility === "all" ? undefined : { visibility }}
        placeholder="Поиск по названию…"
        className="admin-search-lg mb-4"
      />

      {communities.length === 0 ? (
        <p className="text-secondary">{q ? "Ничего не найдено." : "Пока нет сообществ."}</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {communities.map((c) => (
            <div
              key={c.id}
              className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3"
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <span className="d-block">
                  {/* Название ведёт в админскую карточку, а не на сайт:
                      у закрытого сообщества публичная страница ничего
                      админу не покажет, пока он не в нём. */}
                  <Link href={`/admin/communities/${c.id}`} className="link-body-emphasis">
                    {c.title}
                  </Link>
                  <VisibilityBadge visibility={c.visibility} />
                </span>
                <span className="small text-secondary">
                  {c.owner ? (
                    <Link href={`/admin/users/${c.owner.id}`} className="link-body-emphasis">
                      {c.owner.name || c.owner.email || "без имени"}
                    </Link>
                  ) : (
                    "аккаунт удалён"
                  )}{" "}
                  · {memberCounts.get(c.id) ?? 0} участн. · {c._count.posts} тем ·{" "}
                  {c._count.events} встреч · {formatDateWithYear(c.createdAt)}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                <a
                  href={communityHref(c)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                >
                  На сайте ↗
                </a>
                <ConfirmForm
                  action={adminDeleteContent.bind(null, "community", c.id)}
                  confirmMessage={`Удалить сообщество «${c.title}» целиком? Вместе с ним исчезнут его темы, встречи и участники.`}
                >
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    aria-label="Удалить"
                    data-tooltip="Удалить"
                  >
                    <TrashIcon />
                  </button>
                </ConfirmForm>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => adminListHref("/admin/communities", sp, { page: p })}
      />
    </div>
  );
}
