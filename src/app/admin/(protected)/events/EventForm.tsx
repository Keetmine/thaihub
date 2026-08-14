"use client";

import { useMemo, useState } from "react";
import EntityMultiSelect, { type EntityOption } from "@/components/EntityMultiSelect";
import EntitySelect from "@/components/EntitySelect";
import { createPerformerAndReturn } from "../performers/actions";

type PairingOption = {
  id: string;
  name: string | null;
  performerA: { id: string; name: string };
  performerB: { id: string; name: string };
};

function pairingLabel(pairing: PairingOption): string {
  return pairing.name || `${pairing.performerA.name} × ${pairing.performerB.name}`;
}

export default function EventForm({
  action,
  performers,
  pairings,
  dramas,
  locations,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  performers: EntityOption[];
  pairings: PairingOption[];
  dramas: EntityOption[];
  locations: EntityOption[];
  defaultValues?: {
    title: string;
    venue: string;
    description: string;
    date: string;
    startTime: string;
    endTime: string;
    performerIds: string[];
    pairingIds: string[];
    dramaId: string;
    locationId: string;
    presaleDate: string;
    presaleTime: string;
    presaleUrl: string;
  };
  submitLabel: string;
}) {
  const v = defaultValues;
  const isCreating = !v;

  const pairingOptions: EntityOption[] = useMemo(
    () => pairings.map((p) => ({ id: p.id, name: pairingLabel(p) })),
    [pairings],
  );

  const [presaleEnabled, setPresaleEnabled] = useState(Boolean(v?.presaleDate));

  // Extra occurrences of the same event (e.g. a concert repeating 3 nights)
  // — create-only. Editing an already-created event edits just that one
  // date; use "+ Добавить ещё день" at creation time to spin up several
  // identical events (same title/venue/performers/…) in one go.
  const [extraDates, setExtraDates] = useState<string[]>([]);

  function addDay() {
    setExtraDates((prev) => [...prev, ""]);
  }

  function removeDay(index: number) {
    setExtraDates((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDay(index: number, value: string) {
    setExtraDates((prev) => prev.map((d, i) => (i === index ? value : d)));
  }

  return (
    <form
      action={action}
      className="surface d-flex flex-column gap-3 p-4"
    >
      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <label className="form-label">Название *</label>
          <input
            name="title"
            required
            defaultValue={v?.title}
            className="form-control"
          />
        </div>

        <div className="col-12 col-lg-5">
          <label className="form-label">Место *</label>
          <input
            name="venue"
            required
            defaultValue={v?.venue}
            className="form-control"
          />
        </div>
      </div>

      <EntitySelect
        name="locationId"
        label="Локация из каталога (необязательно)"
        options={locations}
        defaultValue={v?.locationId}
        placeholder="Не выбрано"
      />

      <div className="row g-3">
        <div className="col-12 col-sm-4">
          <label className="form-label">Дата *</label>
          <input
            type="date"
            name="date"
            required
            defaultValue={v?.date}
            className="form-control"
          />
        </div>
        <div className="col-6 col-sm-4">
          <label className="form-label">Начало *</label>
          <input
            type="time"
            name="startTime"
            required
            defaultValue={v?.startTime}
            className="form-control"
          />
        </div>
        <div className="col-6 col-sm-4">
          <label className="form-label">Конец</label>
          <input
            type="time"
            name="endTime"
            defaultValue={v?.endTime}
            className="form-control"
          />
        </div>
      </div>

      {isCreating && (
        <div className="d-flex flex-column gap-2">
          {extraDates.map((d, i) => (
            <div key={i} className="row g-2 align-items-center">
              <div className="col-12 col-sm-4">
                <label className="form-label">Ещё день {i + 2}</label>
                <input
                  type="date"
                  name="extraDates"
                  value={d}
                  onChange={(e) => updateDay(i, e.target.value)}
                  className="form-control"
                />
              </div>
              <div className="col-auto" style={{ marginTop: "1.75rem" }}>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => removeDay(i)}
                  aria-label="Удалить день"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <div>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={addDay}
            >
              + Добавить ещё день
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="form-label">Описание</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={v?.description}
          className="form-control"
        />
      </div>

      <EntitySelect
        name="dramaId"
        label="Связанный сериал"
        options={dramas}
        defaultValue={v?.dramaId}
        placeholder="Не выбрано"
      />

      <div>
        <label className="form-label d-block">Исполнители / группы</label>
        <EntityMultiSelect
          name="performerIds"
          options={performers}
          defaultSelectedIds={v?.performerIds}
          placeholder="Начните вводить имя исполнителя…"
          createLabel="Создать исполнителя"
          emptyMessage="Нет добавленных исполнителей. Начните вводить имя, чтобы создать нового."
          onCreateNew={async (query) => {
            const created = await createPerformerAndReturn(query);
            return { id: created.id, name: created.name, photoUrl: null };
          }}
        />
      </div>

      <div>
        <label className="form-label d-block">Пейринги</label>
        <EntityMultiSelect
          name="pairingIds"
          options={pairingOptions}
          defaultSelectedIds={v?.pairingIds}
          placeholder="Начните вводить название пейринга…"
          emptyMessage="Нет добавленных пейрингов. Создайте их на странице «Пейринги»."
        />
      </div>

      <div>
        <div className="form-check form-switch">
          <input
            type="checkbox"
            className="form-check-input"
            role="switch"
            id="presaleEnabled"
            name="presaleEnabled"
            checked={presaleEnabled}
            onChange={(e) => setPresaleEnabled(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="presaleEnabled">
            Препродажа билетов
          </label>
        </div>

        {presaleEnabled && (
          <div className="row g-3 mt-1">
            <div className="col-12 col-sm-4">
              <label className="form-label">Дата препродажи</label>
              <input
                type="date"
                name="presaleDate"
                defaultValue={v?.presaleDate}
                className="form-control"
              />
            </div>
            <div className="col-12 col-sm-4">
              <label className="form-label">Время препродажи</label>
              <input
                type="time"
                name="presaleTime"
                defaultValue={v?.presaleTime}
                className="form-control"
              />
            </div>
            <div className="col-12 col-sm-4">
              <label className="form-label">Ссылка на билеты</label>
              <input
                type="url"
                name="presaleUrl"
                defaultValue={v?.presaleUrl}
                placeholder="https://…"
                className="form-control"
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-2">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
