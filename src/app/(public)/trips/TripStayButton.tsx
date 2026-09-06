"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import { useT } from "@/components/LocaleProvider";
import { setTripStay } from "./actions";

/**
 * «Мои даты» — своё окно присутствия в общей поездке (АА17): подруги
 * едут вместе, но одна прилетает 18-го, а другая 22-го.
 *
 * Кнопка своя у каждого участника, включая владельца: даты тут личные,
 * и правит их человек только себе. Пустые поля означают «еду на всю
 * поездку» — тогда строка присутствия просто удаляется, и человек
 * дальше двигается вместе с датами самой поездки.
 */
export default function TripStayButton({
  tripId,
  startDate,
  endDate,
  label: stayLabel,
}: {
  tripId: string;
  /** Свои даты, если заданы (YYYY-MM-DD) — ими заполняется форма. */
  startDate: string | null;
  endDate: string | null;
  /** Они же человеческой строкой для подписи кнопки: формат дат знает
   *  страница, у неё есть язык зрителя. */
  label: string | null;
}) {
  const uid = useId();
  const t = useT();
  const s = t.trips.stay;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = stayLabel ? `${s.button}: ${stayLabel}` : s.button;

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm ${startDate ? "btn-ghost is-accent" : "btn-ghost"}`}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title={s.title}
      >
        <form
          action={async (fd) => {
            setError(null);
            const result = await setTripStay(tripId, fd);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.refresh();
          }}
          className="d-flex flex-column gap-3"
        >
          <p className="small text-secondary mb-0">{s.hint}</p>
          <div className="row g-2">
            <div className="col-6">
              <label className="form-label small text-secondary" htmlFor={`${uid}-from`}>
                {s.from}
              </label>
              <DatePickerInput id={`${uid}-from`} name="startDate" defaultValue={startDate ?? ""} />
            </div>
            <div className="col-6">
              <label className="form-label small text-secondary" htmlFor={`${uid}-to`}>
                {s.to}
              </label>
              <DatePickerInput id={`${uid}-to`} name="endDate" defaultValue={endDate ?? ""} />
            </div>
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <div className="d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary">
              {s.save}
            </button>
            {/* «Как вся поездка» — та же форма с пустыми полями: своё
                окно снимается, человек снова едет на все дни. */}
            {startDate && (
              <button
                type="submit"
                className="btn btn-ghost"
                formNoValidate
                onClick={(e) => {
                  const form = e.currentTarget.form;
                  if (!form) return;
                  (form.elements.namedItem("startDate") as HTMLInputElement).value = "";
                  (form.elements.namedItem("endDate") as HTMLInputElement).value = "";
                }}
              >
                {s.clear}
              </button>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
