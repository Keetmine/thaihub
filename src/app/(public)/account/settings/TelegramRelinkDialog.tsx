"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import TelegramLoginButton, { type TelegramAuthResult } from "@/components/TelegramLoginButton";

export type RelinkInfo = {
  telegramUsername: string | null;
  otherName: string | null;
  /** «3 любимых артиста», «2 поездки» — только непустое. */
  losses: string[];
};

/**
 * Подключение Telegram — попапом поверх настроек.
 *
 * Открывается и закрывается мгновенно: при открытии ничего не грузится,
 * при закрытии ничего не сохраняется. Раньше подтверждение переноса
 * держалось на куке — попап ходил на сервер при открытии и ждал её
 * удаления при отмене, отсюда «Закрываем…» и заметная задержка. Теперь
 * подписанные данные живут в состоянии, а подпись проверяется на
 * сервере при подтверждении.
 *
 * Два шага в одном окне: сначала кнопка Telegram, а если этот Telegram
 * занят другим аккаунтом — предупреждение с тем, что будет потеряно.
 */
export default function TelegramRelinkDialog({
  botUsername,
  open,
  onClose,
  onLinked,
}: {
  botUsername: string;
  open: boolean;
  onClose: () => void;
  /** Привязали — родителю нужно обновить блок настроек. */
  onLinked: () => void;
}) {
  const [relink, setRelink] = useState<{ auth: string; info: RelinkInfo } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setRelink(null);
    setError(null);
    onClose();
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
        onLinked();
        close();
      } else if (data.status === "relink") {
        setRelink({ auth: data.auth, info: data.info });
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

  async function confirmRelink() {
    if (!relink) return;
    setBusy(true);
    setError(null);
    const { confirmTelegramRelink } = await import("./telegram-relink/actions");
    const result = await confirmTelegramRelink(relink.auth);
    setBusy(false);
    if (result.ok) {
      onLinked();
      close();
    } else {
      setError(result.error);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Подключить Telegram">
      <div className="d-flex flex-column gap-3">
        {!relink ? (
          <>
            <p className="mb-0 text-secondary">
              Напоминания о событиях, старте продаж билетов и новостях друзей
              будут приходить в Telegram. Отключить можно здесь же.
            </p>
            <TelegramLoginButton botUsername={botUsername} mode="link" onAuth={handleAuth} />
            {busy && <p className="small text-secondary mb-0">Привязываем…</p>}
          </>
        ) : (
          <>
            <p className="mb-0">
              Telegram{relink.info.telegramUsername ? ` @${relink.info.telegramUsername}` : ""} уже
              привязан к другому аккаунту
              {relink.info.otherName ? ` — «${relink.info.otherName}»` : ""}. Один Telegram может
              принадлежать только одному аккаунту.
            </p>

            <div>
              <p className="fw-medium text-white mb-1">Что произойдёт</p>
              <ul className="text-secondary mb-0 d-flex flex-column gap-1">
                <li>Telegram привяжется к аккаунту, в котором вы сейчас.</li>
                <li>Старый аккаунт будет удалён — войти в него больше не получится.</li>
                {relink.info.losses.length > 0 ? (
                  <li>Вместе с ним пропадут: {relink.info.losses.join(", ")}.</li>
                ) : (
                  <li>Данных в нём нет — терять нечего.</li>
                )}
              </ul>
            </div>

            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmRelink}
                disabled={busy}
              >
                {busy ? "Переносим…" : "Перенести и удалить старый"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={close}>
                Отмена
              </button>
            </div>
          </>
        )}

        {error && <p className="small text-danger mb-0">{error}</p>}
      </div>
    </Modal>
  );
}
