"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TicketIcon, TrashIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";
import { uploadErrorMessage } from "@/lib/uploadErrors";
import { setAttendanceTicket, removeAttendanceTicket } from "./ticketActions";

export type TicketRow = {
  occurrenceId: string;
  dateLabel: string;
  ticketUrl: string | null;
};

/** «Мои билеты» — видный блок на странице события: к каждой дате, куда
 *  идёшь, можно прикрепить купленный билет (PDF или скрин). */
export default function TicketSection({ rows }: { rows: TicketRow[] }) {
  const t = useT();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  if (rows.length === 0) return null;

  async function upload(occurrenceId: string, file: File) {
    setBusyId(occurrenceId);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-ticket", { method: "POST", body: fd });
      const data = await res.json();
      // Ручка отдаёт код ошибки, а не фразу — язык страницы ей недоступен.
      if (!res.ok) {
        setError(uploadErrorMessage(t, data, t.events.tickets.uploadFailed));
        return;
      }
      // Экшен возвращает ошибку значением (текст исключения в проде до
      // клиента не доезжает) — показываем её тут же, у формы.
      const result = await setAttendanceTicket(occurrenceId, data.url);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError(t.events.tickets.uploadFailedLong);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(occurrenceId: string) {
    setBusyId(occurrenceId);
    try {
      await removeAttendanceTicket(occurrenceId);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="surface p-4 mb-3"
      style={{ borderLeft: "3px solid var(--bs-primary)" }}
    >
      <h2 className="section-heading mb-2">
        <TicketIcon className="icon-inline" /> {t.events.tickets.heading}
      </h2>
      <div className="d-flex flex-column gap-2">
        {rows.map((row) => (
          <div key={row.occurrenceId} className="d-flex flex-wrap align-items-center gap-2">
            <span className="small text-secondary" style={{ minWidth: "5.5rem" }}>
              {row.dateLabel}
            </span>
            {row.ticketUrl ? (
              <>
                <a
                  href={row.ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
                >
                  <TicketIcon /> {t.events.tickets.open}
                </a>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  aria-label={t.events.tickets.detach}
                  title={t.events.tickets.detach}
                  disabled={busyId === row.occurrenceId}
                  onClick={() => remove(row.occurrenceId)}
                >
                  <TrashIcon />
                </button>
              </>
            ) : (
              <>
                <input
                  ref={(el) => {
                    if (el) inputRefs.current.set(row.occurrenceId, el);
                  }}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="d-none"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(row.occurrenceId, f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyId === row.occurrenceId}
                  onClick={() => inputRefs.current.get(row.occurrenceId)?.click()}
                >
                  {busyId === row.occurrenceId
                    ? t.events.tickets.uploading
                    : t.events.tickets.attach}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {error && <p className="small text-danger mb-0 mt-2">{error}</p>}
    </div>
  );
}
