import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth";
import LetterAvatar from "@/components/LetterAvatar";
import Pagination from "@/components/Pagination";
import { parsePage, totalPagesFor } from "@/lib/pagination";

export const metadata = { title: "Факты на проверку" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "READY", label: "Ждут решения" },
  { key: "PENDING", label: "Ждут обработки" },
  { key: "APPLIED", label: "Применены" },
  { key: "REJECTED", label: "Отклонены" },
] as const;
const PAGE_SIZE = 40;

/**
 * Очередь фактов артистов (просьба владельца 2026-09-26). Импортёры
 * кладут сюда пришедшие факты, модель предлагает слитый и переведённый
 * список, владелец открывает запись, смотрит сравнение в три колонки,
 * правит руками и применяет. Только для админа.
 */
export default async function FactsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "READY";
  const page = parsePage(sp.page);

  const [counts, rows, total] = await Promise.all([
    prisma.factsReview.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.factsReview.findMany({
      where: { status: tab },
      include: { performer: { select: { name: true, realName: true, photoUrl: true, trivia: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.factsReview.count({ where: { status: tab } }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2rem" }}>
        Факты на проверку
      </h1>
      <p className="text-secondary mb-4" style={{ maxWidth: "44rem" }}>
        Факты об артистах с внешних источников (фандом, kprofiles) не пишутся в
        карточку сразу, а ждут здесь. Модель сливает их с нашими — наши остаются
        дословно, новое пересказывается и переводится. Откройте запись: слева
        наши факты, в середине и справа — что будет после, новые строки отмечены
        «+». Правьте руками и применяйте.
      </p>

      <div className="tab-bar mb-3">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/facts?tab=${t.key}`}
            className={`tab-bar-item ${tab === t.key ? "active" : ""}`}
          >
            {t.label} ({countOf(t.key)})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-secondary">Здесь пусто.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/admin/facts/${r.id}`}
              className="surface d-flex align-items-center gap-3 p-3 text-decoration-none"
            >
              <LetterAvatar name={r.performer.name} photoUrl={r.performer.photoUrl} size={2.25} />
              <div style={{ minWidth: 0 }} className="flex-grow-1">
                <span className="font-display fw-medium text-white d-block text-truncate">
                  {r.performer.name}
                  {r.performer.realName && (
                    <span className="text-secondary fw-normal"> ({r.performer.realName})</span>
                  )}
                </span>
                <span className="small text-secondary">
                  {r.source} · пришло {r.incoming.length} · наших {r.performer.trivia.length}
                  {r.proposedEn.length > 0 && ` · после ${r.proposedEn.length}`}
                </span>
              </div>
              <span className="small text-secondary flex-shrink-0">
                {r.createdAt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              </span>
            </Link>
          ))}
        </div>
      )}
      <Pagination
        page={page}
        totalPages={totalPagesFor(total, PAGE_SIZE)}
        buildHref={(p) => `/admin/facts?tab=${tab}&page=${p}`}
      />
    </div>
  );
}
