import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth";
import { diffFacts, type DiffLine } from "@/lib/factsReview";
import LetterAvatar from "@/components/LetterAvatar";
import FactsEditor from "./FactsEditor";

export const metadata = { title: "Факты на проверку" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  PENDING: "ждёт обработки",
  READY: "ждёт решения",
  APPLIED: "применено",
  REJECTED: "отклонено",
};

/** Колонка со строками в стиле гитхаба: + зелёным, − красным. */
function DiffColumn({ title, lines, empty }: { title: string; lines: DiffLine[]; empty: string }) {
  return (
    <div className="col-12 col-lg-4">
      <div className="surface p-0 h-100">
        <div className="small text-secondary px-3 py-2 border-bottom">{title}</div>
        {lines.length === 0 ? (
          <p className="small text-secondary m-0 p-3">{empty}</p>
        ) : (
          <ul className="facts-diff list-unstyled m-0">
            {lines.map((l, i) => (
              <li key={i} className={`facts-diff-line is-${l.kind}`}>
                <span className="facts-diff-mark" aria-hidden="true">
                  {l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}
                </span>
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Одна запись очереди фактов: три колонки (просьба владельца
 * 2026-09-26) — оригинал (наши факты на момент обработки), после
 * (предложенный английский список со сравнением) и перевод (русский
 * список со сравнением против нашего прежнего русского). Под ними —
 * ручная правка и решение.
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

  const currentRu =
    ((r.performer.translations as { ru?: { trivia?: string[] } } | null)?.ru?.trivia as string[] | undefined) ?? [];
  // Оригинал — снимок на момент обработки; пока обработки не было —
  // то, что в карточке сейчас.
  const baseEn = r.processedAt ? r.baseEn : r.performer.trivia;
  const baseRu = r.processedAt ? r.baseRu : currentRu;
  const hasProposal = r.proposedEn.length > 0;
  // Пока предложения нет — в поля правки кладём оригинал и пришедшее,
  // чтобы можно было собрать список руками.
  const draftEn = hasProposal ? r.proposedEn : [...baseEn, ...r.incoming];
  const draftRu = hasProposal ? r.proposedRu : baseRu;
  const decided = r.status === "APPLIED" || r.status === "REJECTED";

  return (
    <div>
      <Link href="/admin/facts" className="eyebrow text-decoration-none">
        ← Факты на проверку
      </Link>
      <div className="d-flex align-items-center gap-3 mt-3 mb-2">
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
            {r.model && ` · ${r.model === "manual" ? "правлено вручную" : r.model}`}
          </p>
        </div>
      </div>

      {r.status === "PENDING" && (
        <p className="small text-warning mb-3">
          Модель это ещё не обработала: колонки «после» и «перевод» пустые. Можно
          дождаться обработки или собрать список руками ниже — пришедшие факты уже
          подставлены в поле после наших.
        </p>
      )}

      <div className="row g-3 mb-3">
        <DiffColumn
          title={`Оригинал — наши факты (${baseEn.length})`}
          lines={baseEn.map((text) => ({ kind: "same" as const, text }))}
          empty="У артиста фактов не было"
        />
        <DiffColumn
          title={`После (${r.proposedEn.length})`}
          lines={hasProposal ? diffFacts(baseEn, r.proposedEn) : []}
          empty="Предложения ещё нет"
        />
        <DiffColumn
          title={`Перевод (${r.proposedRu.length})`}
          lines={hasProposal ? diffFacts(baseRu, r.proposedRu) : []}
          empty="Перевода ещё нет"
        />
      </div>

      <details className="mb-3">
        <summary className="small text-secondary">Пришло с источника как есть ({r.incoming.length})</summary>
        <ul className="small mt-2">
          {r.incoming.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </details>

      <FactsEditor id={r.id} en={draftEn} ru={draftRu} canApply={r.status === "READY"} decided={decided} />
    </div>
  );
}
