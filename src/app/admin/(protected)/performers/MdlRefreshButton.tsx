"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { refreshPerformerFromMdl } from "./actions";

/**
 * «Обновить инфу» рядом со ссылкой на MyDramaList (просьба владельца
 * 2026-09-26). Берёт адрес прямо из поля — сохранять форму ради этого
 * не нужно — и запускает фоновый импорт с разбором фильмографии.
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
  const [state, setState] = useState<{ kind: "idle" } | { kind: "started" } | { kind: "error"; text: string }>({
    kind: "idle",
  });

  function run() {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    const url = input?.value.trim() ?? "";
    if (!url) {
      setState({ kind: "error", text: "Сначала вставьте ссылку на MyDramaList" });
      return;
    }
    startTransition(async () => {
      const res = await refreshPerformerFromMdl(performerId, url);
      setState(res.ok ? { kind: "started" } : { kind: "error", text: res.error });
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-outline-primary text-nowrap"
        onClick={run}
        disabled={isPending}
        data-tooltip="Дозаполнит пустые поля и сериалы с MyDramaList. Занесённое руками не трогает."
      >
        {isPending ? "Запускаем…" : "Обновить инфу"}
      </button>
      {state.kind !== "idle" && (
        <p className={`small mb-0 w-100 ${state.kind === "error" ? "text-danger" : "text-secondary"}`}>
          {state.kind === "error" ? (
            state.text
          ) : (
            <>
              Импорт запущен вместе с сериалами — ход в{" "}
              <Link href="/admin/imports">журнале импортов</Link>. Когда закончится, обновите страницу.
            </>
          )}
        </p>
      )}
    </>
  );
}
