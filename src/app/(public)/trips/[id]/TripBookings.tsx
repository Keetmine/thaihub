"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmForm from "@/components/ConfirmForm";
import Modal from "@/components/Modal";
import { BuildingIcon, PlaneIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { deleteTripBooking } from "../actions";
import { useT } from "@/components/LocaleProvider";
import BookingForm, { type TripBookingRow } from "./BookingForm";
import { ItemVisibilityBadge } from "../TripItemVisibility";
import type { TripItemVisibilityValue } from "../itemVisibility";
import { JoinToggle, MyTicket, ParticipantsLine, type BookingParticipantView } from "./BookingParticipants";
import type { ParticipantOption } from "./BookingForm";

export type { TripBookingRow };

/**
 * Брони, которым не назначено ни одной даты.
 *
 * Датированные брони живут не здесь, а в самой ленте плана: заселение в
 * день заезда, выселение в день выезда (см. `TripBookingLeg`). Список
 * тут дублировал бы их и снова отъедал пол-экрана; остаётся он ради
 * броней без дат — иначе такую запись негде было бы увидеть и поправить.
 * Кнопки добавления переехали в общий ряд над вкладками поездки.
 */
export default function TripBookings({
  tripId,
  bookings,
  visibilityOptions,
  canJoin = false,
  participantOptions = [],
  viewerId = null,
}: {
  tripId: string;
  canJoin?: boolean;
  participantOptions?: ParticipantOption[];
  viewerId?: string | null;
  /** Только брони без дат — датированные показывает лента. canEdit у
   *  каждой строки свой: у брони нет editableByOthers, и правят её
   *  только автор и владелец поездки (как guardBookingTouch на
   *  сервере), а не любой участник. */
  bookings: (TripBookingRow & {
    canEdit: boolean;
    participants: BookingParticipantView[];
    viewerJoined: boolean;
    myFileUrl: string | null;
  })[];
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);

  function close() {
    setEditing(null);
  }

  // Подстрока брони: маршрут или адрес плюс заметка — всё в одну
  // строку, чтобы бронь занимала ровно столько места, сколько несёт
  // смысла. Дат тут по определению нет.
  const subline = (b: TripBookingRow) => {
    const route =
      b.kind === "FLIGHT"
        ? [b.fromPlace, b.toPlace].filter(Boolean).join(" → ") || null
        : b.address;
    return [route, b.note].filter(Boolean).join(" · ");
  };

  // Модалка правки одна на весь блок: вид брони берём у неё самой.
  const editingBooking = editing ? (bookings.find((b) => b.id === editing) ?? null) : null;
  const modalKind = editingBooking?.kind ?? null;

  // Броней без дат нет — блока нет вовсе: место над лентой дорогое.
  if (bookings.length === 0) return null;

  return (
    <section className="mb-4">
      <h2 className="section-heading mb-2">{t.trips.bookings.undatedHeading}</h2>
      <div className="d-flex flex-column gap-2">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="surface booking-row d-flex align-items-center gap-2 px-3 py-2"
              >
                <span className="text-secondary flex-shrink-0" aria-hidden>
                  {b.kind === "FLIGHT" ? <PlaneIcon /> : <BuildingIcon />}
                </span>
                <span className="d-flex flex-wrap align-items-baseline gap-2" style={{ minWidth: 0 }}>
                  <span className="text-white text-truncate">{b.name}</span>
                  <ItemVisibilityBadge visibility={b.visibility} />
                  <span className="small text-secondary text-truncate">{subline(b)}</span>
                  <ParticipantsLine kind={b.kind} participants={b.participants} />
                </span>
                <span className="d-flex align-items-center gap-1 flex-shrink-0 ms-auto">
                  {canJoin && b.viewerJoined && b.myFileUrl !== b.fileUrl && (
                    <MyTicket tripId={tripId} bookingId={b.id} kind={b.kind} fileUrl={b.myFileUrl} />
                  )}
                  {canJoin && <JoinToggle tripId={tripId} bookingId={b.id} kind={b.kind} joined={b.viewerJoined} />}
                  {b.fileUrl && (
                    <a
                      href={b.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                    >
                      {b.kind === "FLIGHT" ? t.trips.bookings.ticketLink : t.trips.bookings.bookingLink}
                    </a>
                  )}
                  {b.url && (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                    >
                      {t.trips.bookings.link}
                    </a>
                  )}
                  {b.canEdit && (
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={
                          b.kind === "FLIGHT"
                            ? t.trips.bookings.editFlight
                            : t.trips.bookings.editBooking
                        }
                        onClick={() => setEditing(b.id)}
                      >
                        <PencilIcon />
                      </button>
                      <ConfirmForm
                        action={async () => {
                          // Ошибку возвращаем ConfirmForm — она покажет её в
                          // модалке подтверждения ({ error } из результата).
                          const result = await deleteTripBooking(tripId, b.id);
                          if (!result.ok) return result;
                          router.refresh();
                        }}
                        confirmMessage={t.trips.bookings.deleteConfirm(b.name)}
                      >
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          aria-label={
                            b.kind === "FLIGHT"
                              ? t.trips.bookings.deleteFlight
                              : t.trips.bookings.deleteBooking
                          }
                        >
                          <TrashIcon />
                        </button>
                      </ConfirmForm>
                    </>
                  )}
                </span>
              </div>
            ))}
      </div>

      <Modal
        open={modalKind !== null}
        onClose={close}
        title={modalKind === "FLIGHT" ? t.trips.bookings.flightTitle : t.trips.bookings.hotelTitle}
      >
        {modalKind && (
          <BookingForm
            tripId={tripId}
            kind={modalKind}
            booking={editingBooking ?? undefined}
            visibilityOptions={visibilityOptions}
            participantOptions={participantOptions}
            viewerId={viewerId}
            onSaved={close}
            onCancel={close}
          />
        )}
      </Modal>
    </section>
  );
}
