import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth";
import { buildFactRows } from "@/lib/factsReview";
import LetterAvatar from "@/components/LetterAvatar";
import FactsTable from "./FactsTable";

export const metadata = { title: "Факты на проверку" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  PENDING: "ждёт разбора",
  APPLIED: "применено",
  REJECTED: "отклонено",
};

/**
 * Одна запись очереди фактов — разбор руками (просьба владельца
 * 2026-09-26): таблица «до / после объединения / перевод», строка на
 * факт. Наши факты идут сверху со своим русским, пришедшие — снизу с
 * «+» и пустым переводом.
 */
export default async function FactsReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const r = await prisma.factsReview.findUnique({
    where: { id },
    include: {
      performer: { select: { id: true, name: true, realName: true, photoUrl: true, trivia: true, translations: true } },
    },
  });
  if (!r) notFound();

  const ourRu =
    ((r.performer.translations as { ru?: { trivia?: string[] } } | null)?.ru?.trivia as string[] | undefined) ?? [];
  const rows = buildFactRows(r.performer.trivia, ourRu, r.incoming);
  const decided = r.status !== "PENDING";

  return (
    <div>
      <Link href="/admin/facts" className="eyebrow text-decoration-none">
        ← Факты на проверку
      </Link>
      <div className="d-flex align-items-center gap-3 mt-3 mb-3">
        <LetterAvatar name={r.performer.name} photoUrl={r.performer.photoUrl} size={3} />
        <div style={{ minWidth: 0 }}>
          <h1 className="display-1-tight mb-0" style={{ fontSize: "1.8rem" }}>
            <Link href={`/admin/performers/${r.performer.id}/edit`} className="text-reset text-decoration-none">
              {r.performer.name}
            </Link>
            {r.performer.realName && (
              <span className="text-secondary fw-normal fs-5"> ({r.performer.realName})</span>
            )}
          </h1>
          <p className="small text-secondary mb-0">
            {STATUS[r.status] ?? r.status} · источник {r.source}
            {r.sourceUrl && (
              <>
                {" · "}
                <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-secondary">
                  страница ↗
                </a>
              </>
            )}
            {" · "}наших {r.performer.trivia.length}, пришло новых {rows.filter((x) => x.original === null).length}
          </p>
        </div>
      </div>

      {decided ? (
        <p className="text-secondary">
          Запись {STATUS[r.status]}. Сейчас у артиста на сайте {r.performer.trivia.length} фактов.
        </p>
      ) : (
        <FactsTable id={r.id} initial={rows} decided={decided} />
      )}
    </div>
  );
}
