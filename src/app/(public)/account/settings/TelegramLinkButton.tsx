"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TelegramLoginButton, { type TelegramAuthResult } from "@/components/TelegramLoginButton";
import TelegramRelinkDialog, { type RelinkInfo } from "./TelegramRelinkDialog";

type LinkResponse =
  | { status: "linked" }
  | { status: "failed" }
  | { status: "unauthorized" }
  | { status: "relink"; info: RelinkInfo };

/**
 * Привязка Telegram из настроек — без ухода со страницы.
 *
 * Виджет отдаёт профиль в колбэк, отсюда он уходит фоновым запросом, и
 * страница остаётся на месте: если Telegram занят другим аккаунтом,
 * подтверждение переноса всплывает попапом прямо здесь. Раньше кнопка
 * уводила браузер на серверный колбэк и возвращала назад — страница
 * успевала перезагрузиться до того, как человек видел вопрос.
 */
export default function TelegramLinkButton({ botUsername }: { botUsername: string }) {
  const router = useRouter();
  const [relink, setRelink] = useState<RelinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAuth(user: TelegramAuthResult) {
    setBusy(true);
    setError(null);
    try {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(user)) body.set(k, String(v));
      const res = await fetch("/api/auth/telegram/link", { method: "POST", body });
      const data = (await res.json()) as LinkResponse;

      if (data.status === "linked") {
        // Подключение показывает сервер — обновляем блок настроек.
        router.refresh();
      } else if (data.status === "relink") {
        setRelink(data.info);
      } else if (data.status === "unauthorized") {
        setError("Сессия истекла — войдите заново.");
      } else {
        setError("Telegram не подтвердил вход. Попробуйте ещё раз.");
      }
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TelegramLoginButton botUsername={botUsername} mode="link" onAuth={handleAuth} />
      {busy && <p className="small text-secondary mt-2 mb-0">Привязываем…</p>}
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
      {relink && <TelegramRelinkDialog info={relink} onClose={() => setRelink(null)} />}
    </>
  );
}
