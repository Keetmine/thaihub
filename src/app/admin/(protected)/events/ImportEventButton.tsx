"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import TtmImportFlow from "../imports/ttm/TtmImportFlow";

/** Кнопка «Импортировать по ссылке» на /admin/events: открывает попап
 *  с тем же наполнением, что карточка «Событие по ссылке» на странице
 *  импортов (просьба владельца) — не гоняет на /admin/imports ради
 *  одного события. После импорта закрываем модалку и обновляем список
 *  (в TtmImportFlow это ветка onDone вместо перехода). */
export default function ImportEventButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(true)}
      >
        Импортировать по ссылке
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Событие по ссылке"
        wide
      >
        <p className="small text-secondary mb-3">
          Одно поле на пять сайтов — ThaiTicketMajor, Eventpop, Ticketmelon,
          AllTicket, Eventpass: сайт распознаётся по домену. Подтянем
          название, место, даты, постер, цену и описание; список артистов
          отдаёт только TTM — там исполнителей с существующим ником
          привяжем, остальных создадим после вашего подтверждения.
          theconcert.com не парсится (Cloudflare) — такие заводим руками.
        </p>
        <TtmImportFlow
          performers={[]}
          dramas={[]}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </Modal>
    </>
  );
}
