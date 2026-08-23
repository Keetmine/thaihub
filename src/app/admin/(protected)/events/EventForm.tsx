"use client";

import { useMemo, useRef, useState } from "react";
import EntityMultiSelect, { type EntityOption } from "@/components/EntityMultiSelect";
import EntitySelect from "@/components/EntitySelect";
import FormSection from "@/components/admin/FormSection";
import SubmitButton from "@/components/admin/SubmitButton";
import useUnsavedGuard from "@/components/admin/UnsavedGuard";
import FileDropzone from "@/components/FileDropzone";
import { createPerformerAndReturn, searchPerformerOptions } from "../performers/actions";
import { searchDramaOptions } from "../dramas/actions";
import { searchLocationOptions } from "../locations/actions";
import DatePickerInput from "@/components/DatePickerInput";

type PairingOption = {
  id: string;
  name: string | null;
  performerA: { id: string; name: string };
  performerB: { id: string; name: string };
};

function pairingLabel(pairing: PairingOption): string {
  return pairing.name || `${pairing.performerA.name} × ${pairing.performerB.name}`;
}

/** One date/time this event happens on. `id` is the EventOccurrence id
 *  when editing an existing one, or "" for a row not saved yet. */
export type OccurrenceRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Лайнап дня (фестивали): выбранные исполнители. Пусто — общий состав. */
  lineup: EntityOption[];
};

const EMPTY_OCCURRENCE: OccurrenceRow = { id: "", date: "", startTime: "", endTime: "", lineup: [] };

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
    occurrences: OccurrenceRow[];
    performerIds: string[];
    pairingIds: string[];
    dramaId: string;
    locationId: string;
    presaleDate: string;
    presaleTime: string;
    presaleUrl: string;
    ticketPrice: string;
    posterUrl: string;
  };
  submitLabel: string;
}) {
  const v = defaultValues;

  const pairingOptions: EntityOption[] = useMemo(
    () => pairings.map((p) => ({ id: p.id, name: pairingLabel(p) })),
    [pairings],
  );

  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useUnsavedGuard(formRef);
  const [presaleEnabled, setPresaleEnabled] = useState(Boolean(v?.presaleDate));

  // A concert repeating over several nights is still ONE event — this is
  // a repeatable list of dates it happens on, not a single date/time
  // pair. At least one row always stays present.
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>(
    v?.occurrences && v.occurrences.length > 0 ? v.occurrences : [EMPTY_OCCURRENCE],
  );

  function addOccurrence() {
    setOccurrences((prev) => [...prev, { ...EMPTY_OCCURRENCE }]);
  }

  function removeOccurrence(index: number) {
    setOccurrences((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function updateOccurrence(index: number, patch: Partial<OccurrenceRow>) {
    setOccurrences((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="surface d-flex flex-column gap-3 p-4"
    >
      <FormSection title="Основное" hint="что за событие и где проходит">
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
        searchOptions={searchLocationOptions}
      />

      <div>
        <label className="form-label">Цена билетов</label>
        <input
          name="ticketPrice"
          defaultValue={v?.ticketPrice}
          placeholder="например: 6,900 / 5,900 / 5,000 бат"
          className="form-control"
        />
      </div>

      <FileDropzone name="posterUrl" label="Постер" defaultValue={v?.posterUrl} />
      </FormSection>

      <FormSection title="Даты и время" hint="многодневное событие — несколько дней в одной записи">
      <div>
        <label className="form-label d-block">
          Дата и время {occurrences.length > 1 ? "(несколько дней)" : ""}
        </label>
        <div className="d-flex flex-column gap-2">
          {occurrences.map((o, i) => (
            <div key={i} className="row g-2 align-items-end">
              <input type="hidden" name="occurrenceId" value={o.id} />
              <div className="col-12 col-sm-4">
                {i === 0 && <label className="form-label small text-secondary">Дата *</label>}
                <DatePickerInput
                  name="occurrenceDate"
                  required
                  value={o.date}
                  onValueChange={(date) => updateOccurrence(i, { date })}
                />
              </div>
              <div className="col-5 col-sm-3">
                {i === 0 && <label className="form-label small text-secondary">Начало</label>}
                <input
                  type="time"
                  name="occurrenceStartTime"
                  value={o.startTime}
                  onChange={(e) => updateOccurrence(i, { startTime: e.target.value })}
                  className="form-control"
                />
              </div>
              <div className="col-5 col-sm-3">
                {i === 0 && <label className="form-label small text-secondary">Конец</label>}
                <input
                  type="time"
                  name="occurrenceEndTime"
                  value={o.endTime}
                  onChange={(e) => updateOccurrence(i, { endTime: e.target.value })}
                  className="form-control"
                />
              </div>
              <div className="col-2 col-sm-2">
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => removeOccurrence(i)}
                  disabled={occurrences.length === 1}
                  aria-label="Удалить день"
                >
                  ×
                </button>
              </div>
              <input
                type="hidden"
                name="occurrenceLineup"
                value={o.lineup.map((p) => p.id).join(",")}
              />
              <div className="col-12">
                <details open={o.lineup.length > 0}>
                  <summary className="small text-secondary" style={{ cursor: "pointer" }}>
                    Состав этого дня {o.lineup.length > 0 ? `(${o.lineup.length})` : "(как у события)"}
                  </summary>
                  <div className="mt-2">
                    {o.lineup.length > 0 && (
                      <div className="d-flex flex-wrap gap-2 mb-2">
                        {o.lineup.map((p) => (
                          <span key={p.id} className="event-chip performer-chip">
                            {p.name}
                            <button
                              type="button"
                              className="performer-chip-remove"
                              aria-label={`Убрать ${p.name}`}
                              onClick={() =>
                                updateOccurrence(i, {
                                  lineup: o.lineup.filter((x) => x.id !== p.id),
                                })
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Мини-поиск исполнителя для лайнапа дня: общий
                        комбобокс в режиме onPick — состояние живёт в
                        OccurrenceRow.lineup, а не в компоненте. */}
                    <div style={{ maxWidth: "22rem" }}>
                      <EntityMultiSelect
                        options={[]}
                        searchOptions={searchPerformerOptions}
                        excludeIds={o.lineup.map((x) => x.id)}
                        inputClassName="form-control-sm"
                        placeholder="Добавить исполнителя в этот день…"
                        onPick={(picked) => {
                          if (!o.lineup.some((x) => x.id === picked.id)) {
                            updateOccurrence(i, { lineup: [...o.lineup, picked] });
                          }
                        }}
                      />
                    </div>
                  </div>
                </details>
              </div>
            </div>
          ))}
          <div>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={addOccurrence}
            >
              + Добавить ещё день
            </button>
          </div>
        </div>
      </div>

      </FormSection>

      <FormSection title="Описание и состав" hint="кто выступает и с каким сериалом связано">
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
        searchOptions={searchDramaOptions}
      />

      <div>
        <label className="form-label d-block">Исполнители / группы</label>
        <EntityMultiSelect
          name="performerIds"
          options={performers}
          defaultSelectedIds={v?.performerIds}
          placeholder="Начните вводить имя исполнителя…"
          createLabel="Создать исполнителя"
          searchOptions={searchPerformerOptions}
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

      </FormSection>

      <FormSection title="Билеты и препродажа">
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
              <DatePickerInput name="presaleDate" defaultValue={v?.presaleDate} />
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

      </FormSection>

      <div className="admin-form-actions">
        <SubmitButton label={submitLabel} busyLabel="Сохранение…" className="btn btn-primary" />
        {dirty && (
          <span className="small text-secondary">
            ● Есть несохранённые изменения — они пропадут, если уйти со страницы.
          </span>
        )}
      </div>
    </form>
  );
}