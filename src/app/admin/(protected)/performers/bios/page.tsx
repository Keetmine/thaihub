import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MISSING_BIO_WHERE, PERFORMER_SYNC_BATCH } from "@/lib/mdlPerformerSync";
import { runPerformerBioSync, recheckNotFoundPerformers } from "./actions";
import StopImportButton from "../../imports/StopImportButton";
import RunningImportsWatcher from "../../imports/RunningImportsWatcher";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmForm from "@/components/ConfirmForm";
import LetterAvatar from "@/components/LetterAvatar";
import Pagination from "@/components/Pagination";
import { parsePage, totalPagesFor } from "@/lib/pagination";

export const metadata = { title: "Биографии с MyDramaList" };

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * Очередь досбора биографий (просьба владельца 2026-09-23: «страница со
 * всеми такими записями и кнопочка обновить, чтоб оно по таймеру
 * медленно долго пыталось, с возможностью стопнуть»).
 *
 * Страница показывает, кого ждёт обход, и запускает пачку кнопкой;
 * дальше очередь сама расходится задачей по расписанию
 * («MyDramaList: биографии актёров», см. lib/scheduledJobs.ts). Сам
 * обход — в lib/mdlPerformerSync.ts.
 */
export default async function PerformerBiosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const page = parsePage(rawPage);

  const [queueTotal, withUrl, notFound, withBio, soloTotal, queue, running, lastRuns] =
    await Promise.all([
      prisma.performer.count({ where: MISSING_BIO_WHERE }),
      prisma.performer.count({ where: { ...MISSING_BIO_WHERE, mydramalistUrl: { not: null } } }),
      // Смотрели, но биографии так и нет: либо человека на MDL не нашли,
      // либо она там не заполнена.
      prisma.performer.count({
        where: { type: "SOLO", bio: null, mdlSyncedAt: { not: null } },
      }),
      prisma.performer.count({ where: { type: "SOLO", NOT: { bio: null } } }),
      prisma.performer.count({ where: { type: "SOLO" } }),
      prisma.performer.findMany({
        where: MISSING_BIO_WHERE,
        select: {
          id: true,
          name: true,
          realName: true,
          photoUrl: true,
          mydramalistUrl: true,
          _count: { select: { dramas: true } },
        },
        // Тот же порядок, что у пачки: со ссылкой вперёд — им нужна одна
        // страница, а не поиск по трём кандидатам.
        orderBy: [{ mydramalistUrl: { sort: "asc", nulls: "last" } }, { name: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.importRun.findFirst({
        where: { kind: "mdl-performer-bios", status: "RUNNING" },
        select: { id: true, summary: true, startedAt: true },
      }),
      prisma.importRun.findMany({
        where: { kind: "mdl-performer-bios", status: { not: "RUNNING" } },
        orderBy: { startedAt: "desc" },
        take: 5,
        select: { id: true, status: true, summary: true, startedAt: true },
      }),
    ]);

  const bySearch = queueTotal - withUrl;
  const fmt = (d: Date) =>
    d.toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div>
      <RunningImportsWatcher hasRunning={!!running} />
      <Link href="/admin/performers" className="eyebrow text-decoration-none">
        ← Актёры
      </Link>
      <h1 className="display-1-tight mt-3 mb-3" style={{ fontSize: "2rem" }}>
        Биографии с MyDramaList
      </h1>
      <p className="text-secondary mb-4" style={{ maxWidth: "44rem" }}>
        Актёры, у которых в карточке нет биографии. Обход открывает их страницы на
        MyDramaList и дописывает биографию, настоящее имя, дату рождения, фото,
        соцссылки и роли в сериалах, которые у нас уже есть. Заполняется только
        пустое — занесённое руками не переписывается. Кого на MDL не удалось
        опознать наверняка, тот остаётся без биографии: приписать человеку чужую
        хуже, чем оставить поле пустым.
      </p>

      <div className="surface p-3 mb-4">
        <div className="d-flex flex-wrap gap-4 mb-3">
          <div>
            <div className="h4 mb-0">{queueTotal}</div>
            <div className="small text-secondary">в очереди</div>
          </div>
          <div>
            <div className="h4 mb-0">{withUrl}</div>
            <div className="small text-secondary">из них со ссылкой на MDL</div>
          </div>
          <div>
            <div className="h4 mb-0">{bySearch}</div>
            <div className="small text-secondary">ищем по имени</div>
          </div>
          <div>
            <div className="h4 mb-0">
              {withBio} <span className="text-secondary fs-6">из {soloTotal}</span>
            </div>
            <div className="small text-secondary">уже с биографией</div>
          </div>
        </div>

        {running ? (
          <div className="d-flex flex-wrap align-items-center gap-3">
            <span className="small">
              Идёт с {fmt(running.startedAt)}
              {running.summary ? ` · ${running.summary}` : ""}
            </span>
            {/* Прогон не обрывается на полуслове: флаг поднимается, а
                обход замечает его на следующем человеке и выходит сам. */}
            <StopImportButton runId={running.id} />
          </div>
        ) : (
          <div className="d-flex flex-wrap align-items-center gap-3">
            <form action={runPerformerBioSync}>
              <SubmitButton
                label={`Обойти сейчас (${Math.min(PERFORMER_SYNC_BATCH, queueTotal)})`}
                busyLabel="Запускаем…"
                disabled={queueTotal === 0}
              />
            </form>
            <span className="small text-secondary">
              Пачка по {PERFORMER_SYNC_BATCH} человек, дальше очередь расходится сама —{" "}
              <Link href="/admin/schedule?tab=mdl-performer-bios">по расписанию</Link>, до
              десяти пачек за сутки.
            </span>
          </div>
        )}
      </div>

      {notFound > 0 && (
        <div className="surface p-3 mb-4 d-flex flex-wrap align-items-center gap-3">
          <div style={{ minWidth: 0 }}>
            <div className="fw-medium">Смотрели, биографии нет: {notFound}</div>
            <p className="small text-secondary mb-0" style={{ maxWidth: "36rem" }}>
              Их страницы мы уже открывали — человека либо не нашли на MDL, либо
              биографии там нет. Из очереди они убраны, чтобы обход не упирался в
              одни и те же имена. Со временем у нас появляются связи с сериалами, по
              которым человека можно опознать, — тогда есть смысл пройти их заново.
            </p>
          </div>
          <ConfirmForm
            action={recheckNotFoundPerformers}
            confirmMessage={`Вернуть в очередь ${notFound} записей? Обход пройдёт их заново — это займёт время, но ничего не сломает.`}
            confirmLabel="Вернуть"
          >
            <button type="button" className="btn btn-outline-secondary btn-sm">
              Вернуть в очередь
            </button>
          </ConfirmForm>
        </div>
      )}

      {queue.length === 0 ? (
        <p className="text-secondary">
          Очередь пуста — у всех актёров либо есть биография, либо их страницы уже
          смотрели.
        </p>
      ) : (
        <>
          <div className="d-flex flex-column gap-2 mb-4">
            {queue.map((p) => (
              <div
                key={p.id}
                className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <Link
                  href={`/admin/performers/${p.id}/edit`}
                  className="stretched-link text-decoration-none d-flex align-items-center gap-3"
                  style={{ minWidth: 0 }}
                >
                  <LetterAvatar name={p.name} photoUrl={p.photoUrl} size={2.25} />
                  <div style={{ minWidth: 0 }}>
                    <span className="font-display fw-medium text-white d-block text-truncate">
                      {p.name}
                      {p.realName && (
                        <span className="text-secondary fw-normal"> ({p.realName})</span>
                      )}
                    </span>
                    <p className="small text-secondary mb-0">
                      {p._count.dramas} сериал.
                      {p.mydramalistUrl ? " · ссылка на MDL есть" : " · будем искать по имени"}
                    </p>
                  </div>
                </Link>
                {p.mydramalistUrl && (
                  // position-relative + z-2 поднимает ссылку над
                  // stretched-link строки, иначе клик уходил бы в строку.
                  <a
                    href={p.mydramalistUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="position-relative z-2 small flex-shrink-0"
                  >
                    MDL ↗
                  </a>
                )}
              </div>
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPagesFor(queueTotal, PAGE_SIZE)}
            buildHref={(p) => `/admin/performers/bios?page=${p}`}
          />
        </>
      )}

      {lastRuns.length > 0 && (
        <div className="mt-5">
          <h2 className="h5 mb-3">Последние прогоны</h2>
          <div className="surface p-3 d-flex flex-column gap-2">
            {lastRuns.map((r) => (
              <div key={r.id} className="small">
                <span className="text-secondary">{fmt(r.startedAt)}</span> ·{" "}
                <span className={r.status === "FAILED" ? "text-danger" : undefined}>
                  {r.status === "DONE"
                    ? "прошёл"
                    : r.status === "FAILED"
                      ? "упал"
                      : "остановлен"}
                </span>
                {r.summary && <> · {r.summary}</>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
