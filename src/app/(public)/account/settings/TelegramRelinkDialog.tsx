"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { confirmTelegramRelink, cancelTelegramRelink } from "./telegram-relink/actions";

export type RelinkInfo = {
  telegramUsername: string | null;
  otherName: string | null;
  /** «3 любимых артиста», «2 поездки» — только непустое. */
  losses: string[];
};

/**
 * Подтверждение переноса Telegram — попапом поверх настроек.
 *
 * Раньше это была отдельная страница: виджет Telegram уводил с настроек
 * на неё, и человек терял контекст ровно в тот момент, когда решал,
 * удалять ли свой второй аккаунт. Теперь настройки остаются под
 * попапом, а отмена просто закрывает его.
 *
 * Открыт сразу при монтировании: компонент рисуется только когда на
 * сервере нашлась кука ожидающего переноса, так что «закрыт» —
 * состояние после отмены, а не до открытия.
 */
export default function TelegramRelinkDialog({ info }: { info: RelinkInfo }) {
  const [open, setOpen] = useState(true);
  const [closing, setClosing] = useState(false);

  async function cancel() {
    if (closing) return;
    setClosing(true);
    // Куку убираем ДО закрытия: иначе перезагрузка страницы в те доли
    // секунды, пока запрос в пути, возвращает попап — отмена выглядит
    // неработающей.
    await cancelTelegramRelink();
    setOpen(false);
  }

  return (
    // Заголовок рисует сам Modal — свой h2 здесь давал бы его дважды.
    <Modal open={open} onClose={cancel} title="Перенести Telegram на этот аккаунт?">
      <div className="d-flex flex-column gap-3">
        <p className="mb-0">
          Telegram{info.telegramUsername ? ` @${info.telegramUsername}` : ""} уже
          привязан к другому аккаунту{info.otherName ? ` — «${info.otherName}»` : ""}.
          Один Telegram может принадлежать только одному аккаунту.
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
          <form action={confirmTelegramRelink}>
            <button type="submit" className="btn btn-primary">
              Перенести и удалить старый
            </button>
          </form>
          <button type="button" className="btn btn-ghost" onClick={cancel} disabled={closing}>
            {closing ? "Закрываем…" : "Отмена"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
