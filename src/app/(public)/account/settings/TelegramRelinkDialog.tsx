"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/components/LocaleProvider";
import { confirmTelegramRelink } from "./telegram-relink/actions";

export type RelinkInfo = {
  telegramUsername: string | null;
  otherName: string | null;
  /** Счётчики того, что исчезнет вместе со старым аккаунтом; подписи
   *  собирает сам попап — они зависят от языка страницы. */
  losses: {
    performers: number;
    events: number;
    attendances: number;
    trips: number;
  };
};

/**
 * Подтверждение переноса Telegram — попапом поверх настроек.
 *
 * Всплывает только когда этот Telegram уже привязан к другому аккаунту:
 * перенос лишает тот аккаунт входа, поэтому показываем, что именно
 * будет потеряно, вместо молчаливой перезаписи.
 *
 * Подписанные данные приходят пропом и живут в памяти. Раньше они
 * лежали в куке, из-за чего попап ходил на сервер при открытии и ждал
 * её удаления при закрытии; подпись всё равно перепроверяется на
 * сервере, так что кука ничего не защищала.
 */
export default function TelegramRelinkDialog({
  auth,
  info,
  onClose,
  onLinked,
}: {
  /** Подписанный ответ виджета — сервер проверит подпись заново. */
  auth: string;
  info: RelinkInfo;
  onClose: () => void;
  onLinked: () => void;
}) {
  const t = useT();
  const s = t.account.settings;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lost = (
    [
      [info.losses.performers, s.relinkLostPerformers],
      [info.losses.events, s.relinkLostEvents],
      [info.losses.attendances, s.relinkLostAttendances],
      [info.losses.trips, s.relinkLostTrips],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => label(n));

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await confirmTelegramRelink(auth);
    setBusy(false);
    if (result.ok) onLinked();
    else setError(result.error);
  }

  return (
    <Modal open onClose={onClose} title={s.relinkTitle}>
      <div className="d-flex flex-column gap-3">
        <p className="mb-0">{s.relinkIntro(info.telegramUsername ?? "", info.otherName ?? "")}</p>

        <div>
          <p className="fw-medium text-white mb-1">{s.relinkWhat}</p>
          <ul className="text-secondary mb-0 d-flex flex-column gap-1">
            <li>{s.relinkLinks}</li>
            <li>{s.relinkDeletes}</li>
            {lost.length > 0 ? (
              <li>{s.relinkLosses(lost.join(", "))}</li>
            ) : (
              <li>{s.relinkNoLosses}</li>
            )}
          </ul>
        </div>

        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
            {busy ? s.relinkBusy : s.relinkConfirm}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </button>
        </div>

        {error && <p className="small text-danger mb-0">{error}</p>}
      </div>
    </Modal>
  );
}
