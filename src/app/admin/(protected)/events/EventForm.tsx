"use client";

import { useMemo, useRef, useState } from "react";
import { createPerformerAndReturn } from "../performers/actions";

type PerformerOption = { id: string; name: string; type: string };

export default function EventForm({
  action,
  performers,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  performers: PerformerOption[];
  defaultValues?: {
    title: string;
    venue: string;
    description: string;
    date: string;
    startTime: string;
    endTime: string;
    performerIds: string[];
    presaleDate: string;
    presaleTime: string;
    presaleUrl: string;
  };
  submitLabel: string;
}) {
  const v = defaultValues;

  const [allPerformers, setAllPerformers] = useState<PerformerOption[]>(performers);
  const [selectedIds, setSelectedIds] = useState<string[]>(v?.performerIds ?? []);
  const [query, setQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);

  const [presaleEnabled, setPresaleEnabled] = useState(Boolean(v?.presaleDate));

  const selectedPerformers = useMemo(
    () => selectedIds.map((id) => allPerformers.find((p) => p.id === id)).filter(
      (p): p is PerformerOption => Boolean(p),
    ),
    [selectedIds, allPerformers],
  );

  const filteredPerformers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPerformers.filter((p) => {
      if (selectedIds.includes(p.id)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [allPerformers, selectedIds, query]);

  const trimmedQuery = query.trim();
  const hasExactMatch = allPerformers.some(
    (p) => p.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const showCreateOption = trimmedQuery.length > 0 && !hasExactMatch;

  function addPerformer(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery("");
  }

  function removePerformer(id: string) {
    setSelectedIds((prev) => prev.filter((pid) => pid !== id));
  }

  async function handleCreatePerformer() {
    if (!trimmedQuery || isCreating) return;
    setIsCreating(true);
    try {
      const created = await createPerformerAndReturn(trimmedQuery);
      setAllPerformers((prev) => [...prev, created]);
      addPerformer(created.id);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <form
      action={action}
      className="surface d-flex flex-column gap-3 p-4"
      style={{ maxWidth: "70rem" }}
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

      <div>
        <label className="form-label">Описание</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={v?.description}
          className="form-control"
        />
      </div>

      <div>
        <label className="form-label d-block">Исполнители / группы</label>

        {selectedPerformers.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-2">
            {selectedPerformers.map((p) => (
              <span key={p.id} className="event-chip performer-chip">
                {p.name}
                <input type="hidden" name="performerIds" value={p.id} />
                <button
                  type="button"
                  className="performer-chip-remove"
                  onClick={() => removePerformer(p.id)}
                  aria-label={`Убрать ${p.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="performer-combobox" ref={comboboxRef}>
          <input
            type="text"
            className="form-control"
            placeholder="Начните вводить имя исполнителя…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsDropdownOpen(true)}
            onBlur={() => {
              // allow click on dropdown options to register before closing
              window.setTimeout(() => setIsDropdownOpen(false), 150);
            }}
          />

          {isDropdownOpen && (filteredPerformers.length > 0 || showCreateOption) && (
            <div className="performer-combobox-dropdown">
              {filteredPerformers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="performer-combobox-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addPerformer(p.id)}
                >
                  {p.name}
                </button>
              ))}
              {showCreateOption && (
                <button
                  type="button"
                  className="performer-combobox-option performer-combobox-create"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleCreatePerformer}
                  disabled={isCreating}
                >
                  {isCreating ? "Создание…" : `+ Создать «${trimmedQuery}»`}
                </button>
              )}
            </div>
          )}
        </div>

        {allPerformers.length === 0 && (
          <p className="small text-secondary mt-2">
            Нет добавленных исполнителей. Начните вводить имя, чтобы создать нового.
          </p>
        )}
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
