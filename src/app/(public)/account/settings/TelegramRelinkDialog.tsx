"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { confirmTelegramRelink } from "./telegram-relink/actions";

export type RelinkInfo = {
  telegramUsername: string | null;
  otherName: string | null;
  /** «3 любимых артиста», «2 поездки» — только непустое. */
  losses: string[];
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await confirmTelegramRelink(auth);
    setBusy(false);
    if (result.ok) onLinked();
    else setError(result.error);
  }

  return (
    <Modal open onClose={onClose} title="Перенести Telegram на этот аккаунт?">
      <div className="d-flex flex-column gap-3">
        <p className="mb-0">
          Telegram{info.telegramUsername ? ` @${info.telegramUsername}` : ""} уже привязан к другому
          аккаунту{info.otherName ? ` — «${info.otherName}»` : ""}. Один Telegram может принадлежать
          только одному аккаунту.
        </p>

        <div>
          <p className="fw-medium text-white mb-1">Что произойдёт</p>
          <ul className="text-secondary mb-0 d-flex flex-column gap-1">
            <li>Telegram привяжется к аккаунту, в котором вы сейчас.</li>
            <li>Старый аккаунт будет удалён — войти в него больше не получится.</li>
            {info.losses.length > 0 ? (
              <li>Вместе с ним пропадут: {info.losses.join(", ")}.</li>
            ) : (
              <li>Данных в нём нет — терять нечего.</li>
            )}
          </ul>
        </div>

        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
            {busy ? "Переносим…" : "Перенести и удалить старый"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Отмена
          </button>
        </div>

        {error && <p className="small text-danger mb-0">{error}</p>}
      </div>
    </Modal>
  );
}
