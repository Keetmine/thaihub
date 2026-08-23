import { requireAdminPage } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import Pagination from "@/components/Pagination";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { deleteWikiArticle } from "./actions";
import { formatShortDate } from "@/lib/dates";

export const metadata = { title: "Вики" };

export const dynamic = "force-dynamic";

export default async function AdminWikiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdminPage();
  const { q: rawQ, page: rawPage } = await searchParams;
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);
  const where = q
    ? { title: { contains: q, mode: "insensitive" as const } }
    : {};
  const [articles, total] = await Promise.all([
    prisma.wikiArticle.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.wikiArticle.count({ where }),
  ]);
  const totalPages = totalPagesFor(total);

  return (
    <div>
      <span className="eyebrow">Коммьюнити</span>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Вики
        </h1>
        <Link href="/admin/wiki/new" className="btn btn-primary btn-sm">
          + Новая статья
        </Link>
      </div>

      <NameSearchBox action="/admin/wiki" q={q} placeholder="Поиск по названию…" />

      {articles.length === 0 ? (
        <p className="text-secondary">
          {q
            ? "Ничего не найдено."
            : "Пока нет статей. Идеи: как купить билеты на концерт, как искать дешёвые перелёты, виза в Таиланд."}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {articles.map((a) => (
            <div key={a.id} className="surface d-flex align-items-center justify-content-between gap-3 p-3">
              <div style={{ minWidth: 0 }}>
                <p className="font-display fw-medium text-white mb-0 text-truncate">
                  {a.title}
                  {!a.published && (
                    <span className="badge rounded-pill text-bg-secondary ms-2" style={{ fontSize: "0.6rem" }}>
                      черновик
                    </span>
                  )}
                </p>
                <p className="small text-secondary mb-0">
                  обновлена {formatShortDate(a.updatedAt)} {a.updatedAt.getFullYear()}
                </p>
              </div>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                {a.published && (
                  <a
                    href={`/wiki/${a.slug ?? a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    Открыть ↗
                  </a>
                )}
                <Link href={`/admin/wiki/${a.id}/edit`} className="icon-btn" aria-label="Редактировать">
                  <PencilIcon />
                </Link>
                <ConfirmForm
                  action={deleteWikiArticle.bind(null, a.id)}
                  confirmMessage={`Удалить статью «${a.title}»?`}
                >
                  <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить">
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
        buildHref={(p) =>
          `/admin/wiki?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${p}`
        }
      />
    </div>
  );
}
