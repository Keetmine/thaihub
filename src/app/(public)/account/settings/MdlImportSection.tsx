"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppLink from "@/components/AppLink";
import { useT } from "@/components/LocaleProvider";
import { WATCH_STATUS_ORDER } from "@/lib/watchStatus";
import type { MdlListRunState } from "@/lib/mdlListImport";
import { pollMdlImport, startMdlImport } from "./mdlImportActions";

// Импорт списка просмотра с MyDramaList (вкладка «Импорт» в настройках).
//
// Прогон идёт в фоне на сервере (см. mdlImportActions.ts), а форма
// поллит состояние раз в пару секунд: спиннер с живым счётчиком
// страниц/тайтлов, по завершении — итог с разбивкой по статусам и
// списком ненайденного. Поллинг, а не ожидание одного долгого экшена,
// потому что server action живёт в пределах запроса, а прогон с
// паузами и Cloudflare-браузером в минуту может и не уложиться.

const POLL_MS = 2500;

export default function MdlImportSection() {
  const t = useT();
  const s = t.mdlImport;
  const router = useRouter();
  const [input, setInput] = useState("");
  const [run, setRun] = useState<MdlListRunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Поллинг живёт в эффекте и включается флагом: true на маунте (вдруг
  // прогон уже идёт — вернулись на страницу) и после удачного старта.
  const [polling, setPolling] = useState(true);
  // «Дозавершился ли прогон при нас»: router.refresh дёргаем один раз.
  const sawRunning = useRef(false);

  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    void (async () => {
      while (!stopped) {
        let state: MdlListRunState | null = null;
        let failed = false;
        try {
          state = await pollMdlImport();
        } catch {
          failed = true; // сеть моргнула — попробуем следующим тиком
        }
        if (stopped) return;
        if (failed) {
          await wait(POLL_MS);
          continue;
        }
        setRun(state);
        if (state?.state === "running") {
          sawRunning.current = true;
          await wait(POLL_MS);
          continue;
        }
        if (sawRunning.current) {
          sawRunning.current = false;
          if (state) {
            // Статусы уже в базе — пусть остальная страница их подхватит.
            router.refresh();
          } else {
            // Прогон шёл и пропал: сервер перезапустили посреди работы.
            setError(s.errors.lost);
          }
        }
        setPolling(false);
        return;
      }
    })();

    return () => {
      stopped = true;
    };
  }, [polling, router, s.errors.lost]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await startMdlImport(input);
      if (!res.ok) {
        setError(s.errors[res.errorKey]);
        return;
      }
      sawRunning.current = true;
      setRun({ state: "running", startedAt: Date.now(), pages: 0, rows: 0 });
      setPolling(true);
    } catch {
      setError(s.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  const running = run?.state === "running";

  return (
    <div className="surface p-4">
      <h2 className="section-heading mb-2">{s.title}</h2>
      <p className="small text-secondary mb-3">{s.intro}</p>

      <form onSubmit={submit} className="d-flex flex-column gap-2" style={{ maxWidth: 480 }}>
        <label className="form-label mb-0" htmlFor="mdl-import-input">
          {s.inputLabel}
        </label>
        <input
          id="mdl-import-input"
          className="form-control"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={s.inputPlaceholder}
          disabled={running}
        />
        <div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || running}>
            {s.submit}
          </button>
        </div>
      </form>

      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}

      {run?.state === "running" && (
        <div className="d-flex align-items-center gap-2 mt-3">
          <span className="spinner-border spinner-border-sm" aria-hidden />
          <span className="small text-secondary">
            {s.running}{" "}
            {run.pages > 0 ? s.runningProgress(run.pages, run.rows) : s.queued}
          </span>
        </div>
      )}

      {run?.state === "error" && (
        <p className="small text-danger mt-3 mb-0">
          {run.errorKey ? s.errors[run.errorKey] : `${s.errors.generic}: ${run.message}`}
        </p>
      )}

      {run?.state === "done" && (
        <div className="mt-3">
          <p className="fw-medium text-white mb-1">{s.doneTitle}</p>
          <p className="small mb-1">
            {s.doneMatched(run.report.matched)}
            {run.report.matched > 0 && (
              <span className="text-secondary">
                {" "}
                (
                {WATCH_STATUS_ORDER.filter((st) => (run.report.byStatus[st] ?? 0) > 0)
                  .map((st) => `${t.catalog.watchStatus[st]}: ${run.report.byStatus[st]}`)
                  .join(", ")}
                )
              </span>
            )}
          </p>
          <p className="small mb-2">{s.doneNotFound(run.report.notFound.length)}</p>
          {run.report.notFound.length > 0 && (
            <>
              <p className="small text-secondary mb-1">
                {s.notFoundIntro}{" "}
                <AppLink href="/help">{s.helpLink}</AppLink>
              </p>
              <ul className="small mb-2" style={{ maxHeight: 220, overflowY: "auto" }}>
                {run.report.notFound.map((row) => (
                  <li key={row.url}>
                    <a href={row.url} target="_blank" rel="external nofollow noreferrer">
                      {row.title}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="small text-secondary mb-0">{s.repeatHint}</p>
        </div>
      )}
    </div>
  );
}
