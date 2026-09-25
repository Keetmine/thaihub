"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import { cancelImportRun } from "../imports/cancelActions";
import { getImportRunState, refreshPerformerFromMdl } from "./actions";

type RunState = { status: string; summary: string | null; startedAt: string; cancelRequested: boolean };

/** Как часто спрашивать сервер о ходе. Ход пишется не чаще раза в 2 с
 *  (progressWriter), чаще опрашивать незачем. */
const POLL_MS = 1500;
/** Пауза перед перезагрузкой: успеть прочитать итог. */
const RELOAD_DELAY_MS = 1800;

/**
 * «Обновить инфу» рядом со ссылкой на MyDramaList (просьбы владельца
 * 2026-09-26). Берёт адрес прямо из поля — сохранять форму ради этого не
 * нужно — и запускает фоновый импорт с разбором фильмографии.
 *
 * Пока импорт идёт, открыто окно с ходом: лог шагов и время. Закрыть его
 * до конца нельзя — попытка закрыть предлагает остановить импорт. По
 * окончании страница перезагружается, чтобы форма показала свежие данные
 * (иначе следующее «Сохранить» записало бы поверх них старые значения).
 *
 * Кнопка, а не вложенная форма: она стоит внутри формы артиста, а
 * вложенные <form> в HTML запрещены.
 */
export default function MdlRefreshButton({
  performerId,
  inputId,
}: {
  performerId: string;
  /** id поля со ссылкой на MyDramaList. */
  inputId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [askStop, setAskStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const reloadScheduled = useRef(false);

  const running = runId !== null && (run === null || run.status === "RUNNING");

  function start() {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    const url = input?.value.trim() ?? "";
    setError(null);
    if (!url) {
      setError("Сначала вставьте ссылку на MyDramaList");
      return;
    }
    startTransition(async () => {
      const res = await refreshPerformerFromMdl(performerId, url);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLog(["Импорт запущен"]);
      setRun(null);
      setAskStop(false);
      setStopping(false);
      reloadScheduled.current = false;
      setRunId(res.runId);
    });
  }

  // Опрос хода, пока прогон идёт.
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    async function poll() {
      const state = await getImportRunState(runId!).catch(() => null);
      if (!alive || !state) return;
      setRun(state);
      if (state.summary) {
        setLog((prev) => (prev[prev.length - 1] === state.summary ? prev : [...prev, state.summary!]));
      }
    }
    void poll();
    const timer = setInterval(() => {
      setNow(Date.now());
      void poll();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [runId]);

  // Конец прогона: остановили или доделали — перезагружаем страницу.
  // Упавший ждёт, пока человек прочтёт ошибку и закроет окно сам.
  useEffect(() => {
    if (!run || reloadScheduled.current) return;
    if (run.status === "DONE" || run.status === "CANCELLED") {
      reloadScheduled.current = true;
      setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    }
  }, [run]);

  // Уход со страницы посреди импорта — через браузерное «Покинуть?».
  useEffect(() => {
    if (!running) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  const stop = useCallback(async () => {
    if (!runId) return;
    setStopping(true);
    const res = await cancelImportRun(runId);
    if (!res.ok) setStopping(false);
    setAskStop(false);
  }, [runId]);

  const onClose = useCallback(() => {
    if (running) {
      setAskStop(true);
      return;
    }
    // Упал — закрываем и всё равно обновляем: часть данных могла успеть
    // записаться.
    setRunId(null);
    window.location.reload();
  }, [running]);

  const elapsed = run ? Math.max(0, Math.round((now - new Date(run.startedAt).getTime()) / 1000)) : 0;
  const statusLine =
    run?.status === "DONE"
      ? "Готово — обновляем страницу…"
      : run?.status === "CANCELLED"
        ? "Остановлено — обновляем страницу…"
        : run?.status === "FAILED"
          ? "Импорт упал"
          : stopping || run?.cancelRequested
            ? "Останавливаем — дождёмся конца текущего шага…"
            : "Идёт импорт с MyDramaList";

  return (
    <>
      <button
        type="button"
        className="btn btn-outline-primary text-nowrap"
        onClick={start}
        disabled={isPending || running}
        data-tooltip="Дозаполнит пустые поля и сериалы с MyDramaList. Занесённое руками не трогает."
      >
        {isPending ? "Запускаем…" : running ? "Идёт импорт…" : "Обновить инфу"}
      </button>
      {error && <p className="small text-danger mb-0 w-100">{error}</p>}

      <Modal open={runId !== null} onClose={onClose} title="Обновление с MyDramaList">
        <div className="mdl-refresh">
          <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
            <span className={`mdl-refresh-status ${run?.status === "FAILED" ? "is-failed" : ""}`}>
              {running && <span className="mdl-refresh-spinner" aria-hidden />}
              {statusLine}
            </span>
            <span className="small text-secondary">{elapsed} с</span>
          </div>

          <ol className="mdl-refresh-log" aria-live="polite">
            {log.map((line, i) => (
              <li key={i} className={i === log.length - 1 ? "is-current" : undefined}>
                {line}
              </li>
            ))}
          </ol>

          {askStop && running ? (
            <div className="mdl-refresh-ask">
              <p className="small mb-2">
                Импорт ещё идёт. Остановить его? То, что уже записано, останется.
              </p>
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline-danger btn-sm" onClick={stop} disabled={stopping}>
                  Остановить импорт
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskStop(false)}>
                  Продолжить
                </button>
              </div>
            </div>
          ) : (
            <div className="d-flex flex-wrap align-items-center gap-2">
              {running ? (
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={stop}
                  disabled={stopping || run?.cancelRequested}
                >
                  {stopping || run?.cancelRequested ? "Останавливаем…" : "Остановить"}
                </button>
              ) : (
                run?.status === "FAILED" && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                    Закрыть
                  </button>
                )
              )}
              <Link href="/admin/imports" className="small ms-auto" target="_blank">
                Журнал импортов ↗
              </Link>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
