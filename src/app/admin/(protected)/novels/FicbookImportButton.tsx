"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { importNovelFromFicbook } from "./actions";

export default function FicbookImportButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const { id } = await importNovelFromFicbook(url);
      router.push(`/admin/novels/${id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось импортировать");
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Спарсить с Фикбука
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Импорт с Фикбука">
        <div className="d-flex flex-column gap-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://ficbook.net/readfic/…"
            className="form-control"
          />
          <p className="small text-secondary mb-0">
            Достанем название, описание, автора и автора оригинала, метки,
            размер и обложку (со страницы оригинала). Может занять до минуты —
            Фикбук закрыт JS-проверкой.
          </p>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={pending || !url.trim()}>
            {pending ? "Импорт…" : "Импортировать"}
          </button>
        </div>
      </Modal>
    </>
  );
}
