"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/components/LocaleProvider";
import { AddTripPlaceBox, AttachListSelect } from "./TripPlacesControls";
import CreateOwnPlaceButton from "../lists/[id]/CreateOwnPlaceButton";
import { createTripOwnPlace } from "./actions";

/** Кнопка «+ Что посетить» в общем ряду действий над вкладками (подпись
 *  повторяет вкладку — «место» звучало как адрес, а не как «куда
 *  сходить»; просьба владельца). Внутри — оба
 *  способа добавить: поиск по каталогу и своим местам и «своё место» по
 *  ссылке Google Maps. Раньше и то и другое жило только на вкладке «Что
 *  посетить», то есть с плана до них было два клика. */
export default function AddTripPlaceButton({
  tripId,
  addedIds = [],
  availableLists = [],
}: {
  tripId: string;
  /** Уже добавленные места — их не показываем в выдаче поиска. */
  addedIds?: string[];
  /** Свои списки мест: прикрепление живёт в этом же попапе (правка
   *  владельца 2026-09-22), а не отдельным селектом рядом с кнопкой —
   *  для человека это одно действие «добавить, куда сходить». */
  availableLists?: { id: string; title: string }[];
}) {
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
            <AddTripPlaceBox id="add-trip-place-search" tripId={tripId} addedIds={addedIds} />
          </div>
          <CreateOwnPlaceButton
            action={createTripOwnPlace.bind(null, tripId)}
            label={t.trips.places.ownPlace}
            submitLabel={t.trips.places.ownPlaceSubmit}
          />
          {availableLists.length > 0 && (
            <div className="border-top pt-3">
              <span className="form-label small text-secondary d-block">
                {t.trips.places.attachTitle}
              </span>
              <AttachListSelect tripId={tripId} availableLists={availableLists} />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
