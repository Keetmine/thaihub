"use client";

import { useMemo, useRef, useState } from "react";
import EntityMultiSelect, { type EntityOption } from "@/components/EntityMultiSelect";
import EntitySelect, { OpenEntityLink } from "@/components/EntitySelect";
import LetterAvatar from "@/components/LetterAvatar";
import FormSection from "@/components/admin/FormSection";
import SubmitButton from "@/components/admin/SubmitButton";
import useUnsavedGuard from "@/components/admin/UnsavedGuard";
import FileDropzone from "@/components/FileDropzone";
import EventPhotosField, { type EventPhotoRow } from "./EventPhotosField";
import { createPerformerAndReturn, searchPerformerOptions } from "../performers/actions";
import { searchDramaOptions } from "../dramas/actions";
import { createLocationAndReturn, searchLocationOptions } from "../locations/actions";
import DatePickerInput from "@/components/DatePickerInput";
import { adminEntityHref } from "@/app/admin/entityHref";


type PairingOption = {
  id: string;
  name: string | null;
  performerA: { id: string; name: string; photoUrl?: string | null };
  performerB: { id: string; name: string; photoUrl?: string | null };
};

function pairingLabel(pairing: PairingOption): string {
  return pairing.name || `${pairing.performerA.name} × ${pairing.performerB.name}`;
}

/** Строка лайнапа дня: кто выступает и когда. Время держим строкой, как
 *  на афише («16:00-16:45», иногда «TBA»), — фестивали пишут слоты, а не
 *  точные метки. Сцена тоже свободный текст («Monster Stage»). Оба поля
 *  заполняет краулер musicfestival.in.th, руками их правят здесь же. */
export type LineupRow = EntityOption & {
  timeText?: string;
  stage?: string;
};

/** One date/time this event happens on. `id` is the EventOccurrence id
 *  when editing an existing one, or "" for a row not saved yet. */
export type OccurrenceRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Лайнап дня (фестивали): выбранные исполнители. Пусто — общий состав. */
  lineup: LineupRow[];
};

// Время нулями, а не пустым (правка владельца 2026-09-09): пустое поле
// браузер рисует призрачным «12:30», которого в форме нет, и правка
// такого «значения» кончалась ошибкой про дату. «00:00» на сервере
// значит «время не назначено» — см. optionalFormTime в lib/dates.ts.
const EMPTY_OCCURRENCE: OccurrenceRow = {
  id: "",
  date: "",
  startTime: "00:00",
  endTime: "00:00",
  lineup: [],
};

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
    /** Кто проводит («GMM Show») — заполняет краулер фестивалей. */
    organizer: string;
    /** Адрес площадки текстом (район и город). */
    address: string;
    /** Ссылка на карту; бывает коротким maps.app.goo.gl/… */
    mapsUrl: string;
    /** Жанры/теги события — через запятую, как у сериалов и новелл. */
    tags: string;
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
    photos: EventPhotoRow[];
  };
  submitLabel: string;
}) {
  const v = defaultValues;

  // У пейринга своей картинки нет — миниатюрой берём фото первого
  // участника, чтобы вид опции был тот же, что у остальных сущностей.
  // Своей страницы в админке у пейрингов тоже нет, так что и ссылки
  // «открыть» здесь не будет (adminEntityHref вернул бы null).
  const pairingOptions: EntityOption[] = useMemo(
    () =>
      pairings.map((p) => ({
        id: p.id,
        name: pairingLabel(p),
        photoUrl: p.performerA.photoUrl ?? p.performerB.photoUrl ?? null,
      })),
    [pairings],
  );

  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useUnsavedGuard(formRef);
  const [presaleEnabled, setPresaleEnabled] = useState(Boolean(v?.presaleDate));

  // A concert repeating over several nights is still ONE event — this is
  // a repeatable list of dates it happens on, not a single date/time
  // pair. At least one row always stays present.
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>(
    v?.occurrences && v.occurrences.length > 0
      ? // У события без времени в базе пусто — в поле подставляем нули,
        // иначе браузер снова покажет призрачное «12:30» вместо
        // пустоты. Смысл тот же: «00:00» = время не назначено.
        v.occurrences.map((o) => ({
          ...o,
          startTime: o.startTime || "00:00",
          endTime: o.endTime || "00:00",
        }))
      : [EMPTY_OCCURRENCE],
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

  /** Правка времени/сцены одного участника дня. */
  function updateLineupRow(index: number, performerId: string, patch: Partial<LineupRow>) {
    setOccurrences((prev) =>
      prev.map((o, i) =>
        i === index
          ? { ...o, lineup: o.lineup.map((p) => (p.id === performerId ? { ...p, ...patch } : p)) }
          : o,
      ),
    );
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
          <label className="form-label" htmlFor="event-form-title">Название *</label>
          <input id="event-form-title"
            name="title"
            required
            defaultValue={v?.title}
            className="form-control"
          />
        </div>

        <div className="col-12 col-lg-5">
          <label className="form-label" htmlFor="event-form-venue">Место *</label>
          <input id="event-form-venue"
            name="venue"
            required
            defaultValue={v?.venue}
            className="form-control"
          />
        </div>
      </div>

      {/* Адрес и карта — про ту же площадку, что строкой выше: на
          странице события название площадки становится ссылкой на
          карту, а адрес встаёт рядом с ним. */}
      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <label className="form-label" htmlFor="event-form-address">Адрес</label>
          <input id="event-form-address"
            name="address"
            defaultValue={v?.address}
            placeholder="например: Хуайкхванг, Бангкок"
            className="form-control"
          />
        </div>

        <div className="col-12 col-lg-5">
          <label className="form-label" htmlFor="event-form-mapsUrl">Ссылка на карту</label>
          <input id="event-form-mapsUrl"
            type="url"
            name="mapsUrl"
            defaultValue={v?.mapsUrl}
            placeholder="https://maps.app.goo.gl/…"
            className="form-control"
          />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <label className="form-label" htmlFor="event-form-organizer">Организатор</label>
          <input id="event-form-organizer"
            name="organizer"
            defaultValue={v?.organizer}
            placeholder="например: GMM Show"
            className="form-control"
          />
        </div>

        <div className="col-12 col-lg-5">
          {/* Теги — той же манерой, что у сериалов и новелл: одна
              строка через запятую, а не отдельный виджет. */}
          <label className="form-label" htmlFor="event-form-tags">Теги</label>
          <input id="event-form-tags"
            name="tags"
            defaultValue={v?.tags}
            placeholder="Через запятую"
            className="form-control"
          />
        </div>
      </div>

      {/* Постер — компактным боксом сбоку, локация и цена слева
          (просьба владельца: дропзона на всю ширину раздувала форму). */}
      <div className="row g-3">
        <div className="col-12 col-md-8 d-flex flex-column gap-3">
          {/* Локацию можно завести прямо здесь: раньше приходилось уходить
              в /admin/locations и терять заполненную форму события. */}
          <EntitySelect
            name="locationId"
            label="Локация из каталога (необязательно)"
            options={locations}
            defaultValue={v?.locationId}
            placeholder="Не выбрано"
            createLabel="Создать локацию"
            hrefKind="Location"
            searchOptions={searchLocationOptions}
            onCreateNew={async (name) => {
              const created = await createLocationAndReturn(name);
              return { id: created.id, name: created.name, photoUrl: created.photoUrl };
            }}
          />

          <div>
            <label className="form-label" htmlFor="event-form-ticketPrice">Цена билетов</label>
            <input id="event-form-ticketPrice"
              name="ticketPrice"
              defaultValue={v?.ticketPrice}
              placeholder="например: 6,900 / 5,900 / 5,000 бат"
              className="form-control"
            />
          </div>
        </div>
        <div className="col-12 col-md-4">
          <FileDropzone name="posterUrl" label="Постер" defaultValue={v?.posterUrl} compact />
        </div>
      </div>
      </FormSection>

      {/* Ж9: до трёх фото одним списком, без типов и подписей — на
          странице события они стоят рядом над «Моими билетами». */}
      <FormSection
        title="Фото для покупающих билеты"
        hint="схема зала, цены, бенефиты — до трёх, выводятся в ряд на странице события"
      >
        <EventPhotosField name="photos" defaultValue={v?.photos} />
      </FormSection>

      <FormSection title="Даты и время" hint="многодневное событие — несколько дней в одной записи">
      <div>
        <label className="form-label d-block" htmlFor="event-form-occurrenceId">
          Дата и время {occurrences.length > 1 ? "(несколько дней)" : ""}
        </label>
        <div className="d-flex flex-column gap-2">
          {occurrences.map((o, i) => (
            <div key={i} className="row g-2 align-items-end">
              <input id="event-form-occurrenceId" type="hidden" name="occurrenceId" value={o.id} />
              <div className="col-12 col-sm-4">
                {i === 0 && <label className="form-label small text-secondary" htmlFor="event-form-occurrenceDate">Дата *</label>}
                <DatePickerInput id="event-form-occurrenceDate"
                  name="occurrenceDate"
                  required
                  value={o.date}
                  onValueChange={(date) => updateOccurrence(i, { date })}
                />
              </div>
              <div className="col-5 col-sm-3">
                {i === 0 && <label className="form-label small text-secondary" htmlFor="event-form-occurrenceStartTime">Начало</label>}
                <input id="event-form-occurrenceStartTime"
                  type="time"
                  name="occurrenceStartTime"
                  value={o.startTime}
                  onChange={(e) => updateOccurrence(i, { startTime: e.target.value })}
                  className="form-control"
                />
              </div>
              <div className="col-5 col-sm-3">
                {i === 0 && <label className="form-label small text-secondary" htmlFor="event-form-occurrenceEndTime">Конец</label>}
                <input id="event-form-occurrenceEndTime"
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
              {/* Лайнап дня уезжает JSON-ом: кроме id в нём время и
                  сцена, а они свободный текст — разделителем их не
                  разнести. Старую csv-строку сервер тоже понимает. */}
              <input
                type="hidden"
                name="occurrenceLineup"
                value={JSON.stringify(
                  o.lineup.map((p) => ({
                    id: p.id,
                    timeText: p.timeText ?? "",
                    stage: p.stage ?? "",
                  })),
                )}
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
                            {/* Тот же вид, что у чипов мультиселекта:
                                миниатюра + имя + «открыть». */}
                            <LetterAvatar name={p.name} photoUrl={p.photoUrl ?? null} size={1.15} />
                            {p.name}
                            <OpenEntityLink
                              href={adminEntityHref("Performer", p.id)!}
                              name={p.name}
                              compact
                            />
                            {/* Время и сцена — как на афише фестиваля:
                                строкой, а не выбором времени, потому что
                                бывает «16:00-16:45» и «TBA». */}
                            <input
                              type="text"
                              className="performer-chip-input"
                              style={{ width: "6rem" }}
                              value={p.timeText ?? ""}
                              placeholder="16:00-16:45"
                              aria-label={`Время выступления: ${p.name}`}
                              onChange={(e) =>
                                updateLineupRow(i, p.id, { timeText: e.target.value })
                              }
                            />
                            <input
                              type="text"
                              className="performer-chip-input"
                              style={{ width: "7rem" }}
                              value={p.stage ?? ""}
                              placeholder="сцена"
                              aria-label={`Сцена: ${p.name}`}
                              onChange={(e) => updateLineupRow(i, p.id, { stage: e.target.value })}
                            />
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
        <label className="form-label" htmlFor="event-form-description">Описание</label>
        <textarea id="event-form-description"
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
        hrefKind="Drama"
        searchOptions={searchDramaOptions}
      />

      <div>
        <label className="form-label d-block" htmlFor="event-form-performerIds">Исполнители / группы</label>
        <EntityMultiSelect id="event-form-performerIds"
          name="performerIds"
          options={performers}
          defaultSelectedIds={v?.performerIds}
          placeholder="Начните вводить имя исполнителя…"
          createLabel="Создать исполнителя"
          hrefKind="Performer"
          searchOptions={searchPerformerOptions}
          onCreateNew={async (query) => {
            const created = await createPerformerAndReturn(query);
            return { id: created.id, name: created.name, photoUrl: null };
          }}
        />
      </div>

      <div>
        <label className="form-label d-block" htmlFor="event-form-pairingIds">Пейринги</label>
        <EntityMultiSelect id="event-form-pairingIds"
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
              <label className="form-label" htmlFor="event-form-presaleDate">Дата препродажи</label>
              <DatePickerInput id="event-form-presaleDate" name="presaleDate" defaultValue={v?.presaleDate} />
            </div>
            <div className="col-12 col-sm-4">
              <label className="form-label" htmlFor="event-form-presaleTime">Время препродажи</label>
              <input id="event-form-presaleTime"
                type="time"
                name="presaleTime"
                defaultValue={v?.presaleTime || "00:00"}
                className="form-control"
              />
            </div>
            <div className="col-12 col-sm-4">
              <label className="form-label" htmlFor="event-form-presaleUrl">Ссылка на билеты</label>
              <input id="event-form-presaleUrl"
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