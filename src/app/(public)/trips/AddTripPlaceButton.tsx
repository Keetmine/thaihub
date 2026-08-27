"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/components/LocaleProvider";
import { AddTripPlaceBox } from "./TripPlacesControls";
import CreateOwnPlaceButton from "../lists/[id]/CreateOwnPlaceButton";
import { createTripOwnPlace } from "./actions";

/** Кнопка «+ Место» в общем ряду действий над вкладками. Внутри — оба
 *  способа добавить: поиск по каталогу и своим местам и «своё место» по
 *  ссылке Google Maps. Раньше и то и другое жило только на вкладке «Что
 *  посетить», то есть с плана до них было два клика. */
export default function AddTripPlaceButton({ tripId }: { tripId: string }) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        {t.trips.places.addButton}
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title={t.trips.places.addTitle}>
        <div className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary" htmlFor="add-trip-place-search">
              {t.trips.places.searchLabel}
            </label>
            {/* Модалка не закрывается после добавления: мест обычно
                добавляют несколько подряд, а список под ней обновляет
                сам экшен (revalidatePath). */}
            <AddTripPlaceBox id="add-trip-place-search" tripId={tripId} />
          </div>
          <CreateOwnPlaceButton
            action={createTripOwnPlace.bind(null, tripId)}
            label={t.trips.places.ownPlace}
            submitLabel={t.trips.places.ownPlaceSubmit}
          />
        </div>
      </Modal>
    </>
  );
}
