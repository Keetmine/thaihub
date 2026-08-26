"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/components/LocaleProvider";
import BookingForm from "./BookingForm";
import type { TripItemVisibilityValue } from "../itemVisibility";

/** Кнопка «+ Отель» / «+ Перелёт» с формой в модалке. Живёт в общем ряду
 *  действий над вкладками поездки — бронь добавляют с любой вкладки, а не
 *  только из плана. */
export default function AddBookingButton({
  tripId,
  kind,
  visibilityOptions,
}: {
  tripId: string;
  kind: "HOTEL" | "FLIGHT";
  visibilityOptions: readonly TripItemVisibilityValue[];
}) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const isFlight = kind === "FLIGHT";

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        {isFlight ? t.trips.bookings.addFlight : t.trips.bookings.addHotel}
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={isFlight ? t.trips.bookings.flightTitle : t.trips.bookings.hotelTitle}
      >
        {/* Форма монтируется только вместе с модалкой: закрыли — поля
            очистились сами, отдельный сброс не нужен. */}
        {isOpen && (
          <BookingForm
            tripId={tripId}
            kind={kind}
            visibilityOptions={visibilityOptions}
            onSaved={() => setIsOpen(false)}
            onCancel={() => setIsOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
