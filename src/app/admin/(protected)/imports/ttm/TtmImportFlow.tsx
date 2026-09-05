"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import EntitySelect, { type EntityOption } from "@/components/EntitySelect";
import { searchPerformerOptions } from "../../performers/actions";
import { searchDramaOptions } from "../../dramas/actions";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import FileDropzone from "@/components/FileDropzone";
import DatePickerInput from "@/components/DatePickerInput";
import {
  scrapeTtmEventPreview,
  createEventFromTtmImport,
  type TtmImportPreview,
  type TtmImportArtist,
} from "@/app/admin/(protected)/events/importActions";

type ArtistRow = TtmImportArtist & { include: boolean };

export default function TtmImportFlow({
  performers,
  dramas,
  onDone,
}: {
  performers: EntityOption[];
  dramas: EntityOption[];
  /** Куда деваться после успешного импорта. Без колбэка — переход на
   *  /admin/events (со страницы импортов); из модалки на самих
   *  /admin/events переходить некуда, там закрываем попап и refresh. */
  onDone?: () => void;
}) {
  const uid = useId();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TtmImportPreview | null>(null);
  const [artistRows, setArtistRows] = useState<ArtistRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [presaleEnabled, setPresaleEnabled] = useState(false);
  // Extra days detected in the page's date line (e.g. "24 - 25 October")
  // pre-fill here — still editable/removable, same as EventForm's picker,
  // since this is still just one Event with several dates.
  const [extraDates, setExtraDates] = useState<string[]>([]);

  async function handleScrape() {
    setIsScraping(true);
    setScrapeError(null);
    try {
      const result = await scrapeTtmEventPreview(url.trim());
      setPreview(result);
      setArtistRows(result.artists.map((a) => ({ ...a, include: true })));
      setPresaleEnabled(Boolean(result.presaleDate));
      setExtraDates(result.extraDates);
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : "Не удалось спарсить страницу");
    } finally {
      setIsScraping(false);
    }
  }

  function updateArtist(i: number, patch: Partial<ArtistRow>) {
    setArtistRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addExtraDate() {
    setExtraDates((prev) => [...prev, ""]);
  }

  function removeExtraDate(i: number) {
    setExtraDates((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateExtraDate(i: number, value: string) {
    setExtraDates((prev) => prev.map((d, idx) => (idx === i ? value : d)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!preview) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData(e.currentTarget);
      const extraPerformerIds = formData.getAll("extraPerformerIds").map(String).filter(Boolean);
      await createEventFromTtmImport({
        title: String(formData.get("title") ?? ""),
        venue: String(formData.get("venue") ?? ""),
        date: String(formData.get("date") ?? ""),
        startTime: String(formData.get("startTime") ?? ""),
        endTime: String(formData.get("endTime") ?? ""),
        description: String(formData.get("description") ?? ""),
        dramaId: String(formData.get("dramaId") ?? ""),
        ticketPrice: String(formData.get("ticketPrice") ?? ""),
        posterUrl: String(formData.get("posterUrl") ?? ""),
        sourceUrl: preview.sourceUrl,
        extraDates: extraDates.filter(Boolean),
        presaleDate: presaleEnabled ? String(formData.get("presaleDate") ?? "") : "",
        presaleTime: presaleEnabled ? String(formData.get("presaleTime") ?? "") : "",
        presaleUrl: presaleEnabled ? String(formData.get("presaleUrl") ?? "") : "",
        artists: artistRows
          .filter((r) => r.include)
          .map((r) => ({
            fullName: r.fullName,
            nickname: r.nickname,
            performerId: r.matchedPerformerId,
          })),
        extraPerformerIds,
      });
      if (onDone) onDone();
      else router.push("/admin/events");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не удалось создать событие");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!preview) {
    return (
      <div className="surface d-flex flex-column gap-3 p-4" style={{ maxWidth: "40rem" }}>
        <div>
          <label className="form-label" htmlFor="ttm-import-url">
            Ссылка на страницу события
          </label>
          <input
            id="ttm-import-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="thaiticketmajor.com / eventpop.me / ticketmelon.com / allticket.com / eventpass.co"
            className="form-control"
          />
        </div>
        {scrapeError && <p className="small text-danger mb-0">{scrapeError}</p>}
        <div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleScrape}
            disabled={isScraping || !url.trim()}
          >
            {isScraping ? "Парсинг…" : "Спарсить"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="surface d-flex flex-column gap-3 p-4">
      {preview.existingEventId && (
        <p className="alert alert-warning small mb-0 py-2">
          Событие с этим источником уже есть в базе —{" "}
          <a href={`/admin/events/${preview.existingEventId}/edit`} target="_blank" rel="noreferrer">
            открыть его
          </a>
          . «Создать событие» заведёт ДУБЛЬ.
        </p>
      )}
      <p className="small text-secondary mb-0">
        Источник:{" "}
        <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">
          {preview.sourceUrl}
        </a>
        {preview.dateRangeText && <> · на сайте указано: {preview.dateRangeText}</>}
      </p>
      <p className="small text-secondary mb-0">
        Проверьте и при необходимости поправьте всё ниже — в базу ничего не попадёт, пока вы не
        нажмёте «Создать событие».
      </p>

      <div className="row g-3">
        <div className="col-12 col-lg-8">
          <label className="form-label" htmlFor="ttm-import-flow-title">Название *</label>
          <input id="ttm-import-flow-title" name="title" required defaultValue={preview.title} className="form-control" />
        </div>
        <div className="col-12 col-lg-4">
          <label className="form-label" htmlFor="ttm-import-flow-venue">Место *</label>
          <input id="ttm-import-flow-venue" name="venue" required defaultValue={preview.venue} className="form-control" />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-sm-4">
          <label className="form-label" htmlFor="ttm-import-flow-date">Дата *</label>
          <DatePickerInput id="ttm-import-flow-date" name="date" required defaultValue={preview.date} />
        </div>
        <div className="col-6 col-sm-4">
          <label className="form-label" htmlFor="ttm-import-flow-startTime">Начало *</label>
          <input id="ttm-import-flow-startTime"
            type="time"
            name="startTime"
            required
            defaultValue={preview.startTime}
            className="form-control"
          />
        </div>
        <div className="col-6 col-sm-4">
          <label className="form-label" htmlFor="ttm-import-flow-endTime">Конец</label>
          <input id="ttm-import-flow-endTime" type="time" name="endTime" className="form-control" />
        </div>
      </div>

      {extraDates.length > 0 && (
        <div className="d-flex flex-column gap-2">
          {extraDates.map((d, i) => (
            <div key={i} className="row g-2 align-items-center">
              <div className="col-12 col-sm-4">
                <label className="form-label small text-secondary" htmlFor={`${uid}-datepick`}>Ещё день</label>
                <DatePickerInput id={`${uid}-datepick`} value={d} onValueChange={(next) => updateExtraDate(i, next)} />
              </div>
              <div className="col-auto" style={{ marginTop: "1.75rem" }}>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => removeExtraDate(i)}
                  aria-label="Удалить день"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={addExtraDate}>
          + Добавить ещё день
        </button>
      </div>

      <div>
        <label className="form-label" htmlFor="ttm-import-flow-ticketPrice">Цена билетов</label>
        <input id="ttm-import-flow-ticketPrice" name="ticketPrice" defaultValue={preview.ticketPrice} className="form-control" />
      </div>

      <FileDropzone name="posterUrl" label="Постер" defaultValue={preview.posterUrl} />

      <div>
        <label className="form-label" htmlFor="ttm-import-flow-description">Описание</label>
        <textarea
          id="ttm-import-flow-description"
          name="description"
          rows={preview.description ? 6 : 3}
          defaultValue={preview.description}
          className="form-control"
        />
      </div>

      <EntitySelect
        name="dramaId"
        label="Связанный сериал"
        options={dramas}
        placeholder="Не выбрано"
        hrefKind="Drama"
        searchOptions={searchDramaOptions}
      />

      <div>
        <div className="form-check form-switch">
          <input
            type="checkbox"
            className="form-check-input"
            role="switch"
            id="ttmPresaleEnabled"
            checked={presaleEnabled}
            onChange={(e) => setPresaleEnabled(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="ttmPresaleEnabled">
            Препродажа билетов
          </label>
        </div>

        {presaleEnabled && (
          <div className="row g-3 mt-1">
            <div className="col-12 col-sm-4">
              <label className="form-label" htmlFor="ttm-import-flow-presaleDate">Дата открытия продаж</label>
              <DatePickerInput id="ttm-import-flow-presaleDate" name="presaleDate" defaultValue={preview.presaleDate} />
            </div>
            <div className="col-12 col-sm-4">
              <label className="form-label" htmlFor="ttm-import-flow-presaleTime">Время</label>
              <input id="ttm-import-flow-presaleTime"
                type="time"
                name="presaleTime"
                defaultValue={preview.presaleTime}
                className="form-control"
              />
            </div>
            <div className="col-12 col-sm-4">
              <label className="form-label" htmlFor="ttm-import-flow-presaleUrl">Ссылка на билеты</label>
              <input id="ttm-import-flow-presaleUrl"
                type="url"
                name="presaleUrl"
                defaultValue={preview.sourceUrl}
                className="form-control"
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="form-label d-block" htmlFor={`${uid}-input`}>Артисты с сайта</label>
        {artistRows.length === 0 ? (
          <p className="small text-secondary">На странице не найдено артистов.</p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {artistRows.map((row, i) => (
              <div key={i} className="d-flex align-items-center gap-2 flex-wrap">
                <input id={`${uid}-input`}
                  type="checkbox"
                  checked={row.include}
                  onChange={(e) => updateArtist(i, { include: e.target.checked })}
                  aria-label="Добавить"
                />
                <input
                  value={row.nickname}
                  onChange={(e) => updateArtist(i, { nickname: e.target.value, matchedPerformerId: null })}
                  placeholder="Ник"
                  className="form-control form-control-sm"
                  style={{ width: "8rem" }}
                />
                <input
                  value={row.fullName}
                  onChange={(e) => updateArtist(i, { fullName: e.target.value })}
                  placeholder="Полное имя"
                  className="form-control form-control-sm"
                  style={{ width: "16rem" }}
                />
                <span
                  className={`small ${row.matchedPerformerId ? "text-success" : "text-secondary"}`}
                >
                  {row.matchedPerformerId ? "уже есть в базе" : "будет создан новый"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="form-label d-block" htmlFor="ttm-import-flow-extraPerformerIds">Ещё исполнители (вручную)</label>
        <EntityMultiSelect id="ttm-import-flow-extraPerformerIds"
          name="extraPerformerIds"
          options={performers}
          placeholder="Начните вводить имя исполнителя…"
          hrefKind="Performer"
          searchOptions={searchPerformerOptions}
        />
      </div>

      {submitError && <p className="small text-danger mb-0">{submitError}</p>}

      <div className="mt-2">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Создание…" : "Создать событие"}
        </button>
      </div>
    </form>
  );
}
