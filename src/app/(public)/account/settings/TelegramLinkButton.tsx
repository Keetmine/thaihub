"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TelegramRelinkDialog from "./TelegramRelinkDialog";

/**
 * «Подключить Telegram» в настройках.
 *
 * Кнопка открывает попап и ничего больше не делает — ни запросов, ни
 * перезагрузки. Сама привязка начинается с кнопки Telegram внутри
 * попапа, поэтому открытие и закрытие мгновенны.
 */
export default function TelegramLinkButton({ botUsername }: { botUsername: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        Подключить Telegram
      </button>
      <TelegramRelinkDialog
        botUsername={botUsername}
        open={open}
        onClose={() => setOpen(false)}
        onLinked={() => router.refresh()}
      />
    </>
  );
}
