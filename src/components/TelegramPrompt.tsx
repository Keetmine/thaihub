"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import TelegramLoginButton, { type TelegramAuthResult } from "@/components/TelegramLoginButton";
import { useT } from "@/components/LocaleProvider";
import { dismissTelegramPrompt } from "@/app/(public)/account/tourActions";
import { useRouter } from "next/navigation";

/**
 * Предложение привязать Telegram тем, кто зарегистрировался почтой
 * (правка владельца 2026-09-06).
 *
 * Зачем: без телеграма уведомления о новых сериях, друзьях и старте
 * продаж приходят только на сайт — человек про них попросту не узнаёт,
 * пока сам не зайдёт. В настройках привязка была всегда, но туда никто
 * не заходит.
 *
 * Показывается ОДИН раз и не сразу: условия считает сервер (см.
 * `(public)/layout.tsx`) — аккаунт должен быть не первого дня, и у
 * человека должно быть, о чём его уведомлять. Закрыл — не спрашиваем
 * больше; отметка живёт у пользователя, а не в браузере, иначе попап
 * всплывал бы на каждом новом устройстве.
 *
 * Появляется с задержкой: выскочить в лицо в момент открытия страницы —
 * ровно то, за что попапы и не любят.
 */
const DELAY_MS = 12_000;

export default function TelegramPrompt({ botUsername }: { botUsername: string }) {
  const t = useT();
  const s = t.account.telegramPrompt;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  /** Закрытие в любом виде (крестик, «потом», клик мимо) — это ответ
   *  «не сейчас», и второй раз мы уже не спросим. */
  function close() {
    setOpen(false);
    void dismissTelegramPrompt();
  }

  async function handleAuth(user: TelegramAuthResult) {
    setBusy(true);
    setError(null);
    try {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(user)) body.set(k, String(v));
      const res = await fetch("/api/auth/telegram/link", { method: "POST", body });
      const data = await res.json();
      if (data.status === "linked") {
        // Привязали — отметку тоже ставим: предлагать больше нечего.
        void dismissTelegramPrompt();
        setOpen(false);
        router.refresh();
        return;
      }
      // Этот Telegram занят другим аккаунтом (или что-то пошло не так):
      // разбираться с переносом — дело настроек, там для этого есть
      // отдельный диалог. Здесь просто отправляем туда.
      setError(s.linkFailed);
    } catch {
      setError(s.linkFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={s.title}>
      <div className="d-flex flex-column gap-3">
        <p className="mb-0">{s.intro}</p>
        <ul className="small text-secondary mb-0 ps-3">
          <li>{s.pointEpisodes}</li>
          <li>{s.pointFriends}</li>
          <li>{s.pointPresale}</li>
        </ul>
        <p className="small text-secondary mb-0">{s.privacy}</p>
        {error && <p className="small text-danger mb-0">{error}</p>}
        <div className="d-flex flex-wrap align-items-center gap-2">
          <TelegramLoginButton botUsername={botUsername} onAuth={handleAuth} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={close} disabled={busy}>
            {s.later}
          </button>
        </div>
      </div>
    </Modal>
  );
}
