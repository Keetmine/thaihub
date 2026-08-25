"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/LocaleProvider";
import TelegramLoginButton, { type TelegramAuthResult } from "@/components/TelegramLoginButton";
import TelegramRelinkDialog, { type RelinkInfo } from "./TelegramRelinkDialog";

/**
 * Привязка Telegram из настроек.
 *
 * Кнопка виджета стоит прямо в настройках — без промежуточного окна:
 * лишний шаг «сначала откройте попап, потом нажмите Telegram» ничего не
 * добавлял.
 *
 * Виджет отдаёт профиль в колбэк, отсюда он уходит фоновым запросом, и
 * страница остаётся на месте. Попап всплывает только в одном случае —
 * когда этот Telegram занят другим аккаунтом и нужно решить, переносить
 * ли его.
 */
export default function TelegramLinkButton({ botUsername }: { botUsername: string }) {
  const t = useT();
  const router = useRouter();
  const [relink, setRelink] = useState<{ auth: string; info: RelinkInfo } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAuth(user: TelegramAuthResult) {
    setBusy(true);
    setError(null);
    try {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(user)) body.set(k, String(v));
      const res = await fetch("/api/auth/telegram/link", { method: "POST", body });
      const data = await res.json();

      if (data.status === "linked") {
        router.refresh();
      } else if (data.status === "relink") {
        setRelink({ auth: data.auth, info: data.info });
      } else if (data.status === "unauthorized") {
        setError(t.account.settings.telegramSessionExpired);
      } else {
        setError(t.account.settings.telegramNotConfirmed);
      }
    } catch {
      setError(t.account.settings.telegramServerError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TelegramLoginButton botUsername={botUsername} mode="link" onAuth={handleAuth} />
      {busy && (
        <p className="small text-secondary mt-2 mb-0">{t.account.settings.telegramLinking}</p>
      )}
      {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
      {relink && (
        <TelegramRelinkDialog
          auth={relink.auth}
          info={relink.info}
          onClose={() => setRelink(null)}
          onLinked={() => {
            setRelink(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
