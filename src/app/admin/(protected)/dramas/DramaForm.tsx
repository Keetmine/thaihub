"use client";

import { useMemo, useRef, useState } from "react";

type PerformerOption = { id: string; name: string; type: string };
type CastEntry = { id: string; name: string; role: string };

export default function DramaForm({
  action,
  performers,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  performers: PerformerOption[];
  defaultValues?: {
    title: string;
    year: string;
    posterUrl: string;
    synopsis: string;
    mydramalistUrl: string;
    cast: CastEntry[];
  };
  submitLabel: string;
}) {
  const v = defaultValues;

  const [cast, setCast] = useState<CastEntry[]>(v?.cast ?? []);
  const [query, setQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);

  const filteredPerformers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const castIds = new Set(cast.map((c) => c.id));
    return performers.filter((p) => {
      if (castIds.has(p.id)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [performers, cast, query]);

  function addCastMember(id: string) {
    setCast((prev) => {
      if (prev.some((c) => c.id === id)) return prev;
      const performer = performers.find((p) => p.id === id);
      if (!performer) return prev;
      return [...prev, { id: performer.id, name: performer.name, role: "" }];
    });
    setQuery("");
  }

  function removeCastMember(id: string) {
    setCast((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCastRole(id: string, role: string) {
    setCast((prev) => prev.map((c) => (c.id === id ? { ...c, role } : c)));
  }

  return (
    <form
      action={action}
      className="surface d-flex flex-column gap-3 p-4"
    >
      <div className="row g-3">
        <div className="col-12 col-lg-8">
          <label className="form-label">Название *</label>
          <input
            name="title"
            required
            defaultValue={v?.title}
            className="form-control"
          />
        </div>

        <div className="col-12 col-lg-4">
          <label className="form-label">Год</label>
          <input
            type="number"
            name="year"
            defaultValue={v?.year}
            className="form-control"
          />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <label className="form-label">Постер (ссылка на изображение)</label>
          <input
            type="url"
            name="posterUrl"
            defaultValue={v?.posterUrl}
            placeholder="https://…"
            className="form-control"
          />
        </div>
        <div className="col-12 col-lg-6">
          <label className="form-label">Ссылка на MyDramaList</label>
          <input
            type="url"
            name="mydramalistUrl"
            defaultValue={v?.mydramalistUrl}
            placeholder="https://mydramalist.com/…"
            className="form-control"
          />
        </div>
      </div>

      <div>
        <label className="form-label">Синопсис</label>
        <textarea
          name="synopsis"
          rows={4}
          defaultValue={v?.synopsis}
          className="form-control"
        />
      </div>

      <div>
        <label className="form-label d-block">Актёрский состав</label>

        {cast.length > 0 && (
          <div className="d-flex flex-column gap-2 mb-2">
            {cast.map((c) => (
              <div
                key={c.id}
                className="d-flex align-items-center gap-2 p-2 rounded-3"
                style={{ background: "var(--bs-tertiary-bg)", border: "1px solid var(--bs-border-color)" }}
              >
                <span
                  className="font-display fw-medium text-white flex-shrink-0"
                  style={{ minWidth: "9rem" }}
                >
                  {c.name}
                </span>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Роль (персонаж, необязательно)"
                  value={c.role}
                  onChange={(e) => updateCastRole(c.id, e.target.value)}
                />
                <button
                  type="button"
                  className="performer-chip-remove"
                  onClick={() => removeCastMember(c.id)}
                  aria-label={`Убрать ${c.name}`}
                >
                  ×
                </button>
                <input type="hidden" name="castPerformerIds" value={c.id} />
                <input type="hidden" name="castRole" value={c.role} />
              </div>
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

          {isDropdownOpen && filteredPerformers.length > 0 && (
            <div className="performer-combobox-dropdown">
              {filteredPerformers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="performer-combobox-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addCastMember(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {performers.length === 0 && (
          <p className="small text-secondary mt-2">
            Нет исполнителей. Сначала добавьте их в разделе «Исполнители».
          </p>
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
