import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { deleteNovel } from "./actions";
import FicbookImportButton from "./FicbookImportButton";

export const dynamic = "force-dynamic";

export default async function AdminNovelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const novels = await prisma.novel.findMany({
    where: q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { author: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { _count: { select: { dramas: true, links: true } } },
    orderBy: { title: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Новеллы
        </h1>
        <div className="d-flex flex-wrap gap-2">
          <FicbookImportButton />
          <Link href="/admin/novels/new" className="btn btn-primary btn-sm">
            + Добавить новеллу
          </Link>
        </div>
      </div>

      <NameSearchBox action="/admin/novels" q={q} placeholder="Поиск по названию или автору…" />

      {novels.length === 0 ? (
        <p className="text-secondary">{q ? "Ничего не найдено." : "Пока нет новелл."}</p>
      ) : (
        <div className="d-flex flex-column gap-2 scroll-list-lg thin-scroll">
          {novels.map((n) => (
            <div
              key={n.id}
              className="surface d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <div style={{ minWidth: 0 }}>
                <p className="font-display fw-medium text-white mb-0 text-truncate">{n.title}</p>
                <p className="small text-secondary mb-0">
                  {[n.author, `экранизаций: ${n._count.dramas}`, `ссылок: ${n._count.links}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                <Link
                  href={`/admin/novels/${n.id}/edit`}
                  className="icon-btn"
                  aria-label="Редактировать"
                >
                  <PencilIcon />
                </Link>
                <ConfirmForm
                  action={deleteNovel.bind(null, n.id)}
                  confirmMessage={`Удалить новеллу «${n.title}»?`}
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
    </div>
  );
}
