"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import FileDropzone from "@/components/FileDropzone";
import LetterAvatar from "@/components/LetterAvatar";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";
import { setBookingParticipantFile, toggleBookingParticipation } from "../actions";

/** Участник брони — как его видит строка: имя, фото, «это вы». */
export type BookingParticipantView = {
  id: string;
  name: string;
  photoUrl: string | null;
  isViewer: boolean;
};

/**
 * Кто летит этим рейсом / живёт в этом отеле — под названием брони:
 * стопка аватарок и имена («Летят: вы, Аня»). Справа у смотрящего —
 * своя отметка «я тоже» (тот же круглый плюс/галочка, что «я там буду»
 * у личного события) и свой билет: «Мой билет ↗», если приложил, иначе
 * «+ Мой билет». Один рейс на четверых — одна строка, а не четыре
 * (правка владельца 2026-09-19).
 */
export function ParticipantsLine({
  kind,
  participants,
}: {
  kind: "HOTEL" | "FLIGHT";
  participants: BookingParticipantView[];
}) {
  const t = useT();
  if (participants.length === 0) return null;
  // «вы» — первым и без имени: свою строку узнают по слову, а не по имени.
  const sorted = [...participants].sort((a, b) => Number(b.isViewer) - Number(a.isViewer));
  const names = sorted.map((p) => (p.isViewer ? t.trips.bookings.you : p.name)).join(", ");
  return (
    <span className="booking-people d-inline-flex align-items-center gap-2">
      <span className="booking-people-avatars d-inline-flex" aria-hidden>
        {sorted.slice(0, 5).map((p) => (
          <span key={p.id} className="booking-people-avatar" title={p.name}>
            <LetterAvatar name={p.name} photoUrl={p.photoUrl} size={1.35} />
          </span>
        ))}
      </span>
      <span className="small text-secondary text-truncate">
        {kind === "FLIGHT" ? t.trips.bookings.flyingLabel(names) : t.trips.bookings.stayingLabel(names)}
      </span>
    </span>
  );
}

/** Своя отметка «я тоже лечу / живу здесь» — оптимистичный переключатель. */
export function JoinToggle({
  tripId,
  bookingId,
  kind,
  joined,
}: {
  tripId: string;
  bookingId: string;
  kind: "HOTEL" | "FLIGHT";
  joined: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState(joined);
  const [prevProp, setPrevProp] = useState(joined);
  if (joined !== prevProp) {
    setPrevProp(joined);
    setActive(joined);
  }
  const label =
    kind === "FLIGHT"
      ? active
        ? t.trips.bookings.leaveFlight
        : t.trips.bookings.joinFlight
      : active
        ? t.trips.bookings.leaveStay
        : t.trips.bookings.joinStay;
  return (
    <button
      type="button"
      className={`round-icon-btn ${active ? "is-going" : ""}`}
      disabled={isPending}
      aria-pressed={active}
      aria-label={label}
      data-tooltip={label}
      onClick={() => {
        const next = !active;
        setActive(next);
        startTransition(async () => {
          const result = await toggleBookingParticipation(tripId, bookingId).catch(
            () => ({ ok: false as const, error: "" }),
          );
          if (!result.ok) setActive(!next);
          else router.refresh();
        });
      }}
    >
      {active ? <CheckIcon /> : <PlusIcon />}
    </button>
  );
}

/** Свой билет к общей брони: ссылка на приложенный или кнопка
 *  приложить (модалка с той же зоной загрузки, что у формы брони). */
export function MyTicket({
  tripId,
  bookingId,
  kind,
  fileUrl,
}: {
  tripId: string;
  bookingId: string;
  kind: "HOTEL" | "FLIGHT";
  fileUrl: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFlight = kind === "FLIGHT";

  async function submit(formData: FormData) {
    setError(null);
    const result = await setBookingParticipantFile(tripId, bookingId, formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {fileUrl ? (
        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
          {isFlight ? t.trips.bookings.myTicket : t.trips.bookings.myBooking}
        </a>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          {isFlight ? t.trips.bookings.attachMyTicket : t.trips.bookings.attachMyBooking}
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isFlight ? t.trips.bookings.attachTicketTitle : t.trips.bookings.attachBookingTitle}
      >
        <form action={submit} className="d-flex flex-column gap-3">
          <FileDropzone
            name="fileUrl"
            label={isFlight ? t.trips.bookings.ticketFile : t.trips.bookings.bookingFile}
            defaultValue={fileUrl ?? ""}
            accept="image/*,application/pdf"
            endpoint="/api/upload-hotel"
          />
          <p className="small text-secondary mb-0">{t.trips.bookings.attachHint}</p>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <div className="d-flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm">
              {t.common.save}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
