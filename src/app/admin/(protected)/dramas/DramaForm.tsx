"use client";

import { useMemo, useRef, useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import EntitySelect, { type EntityOption } from "@/components/EntitySelect";
import Modal from "@/components/Modal";
import { createPerformerAndReturn } from "../performers/actions";
import { createAgencyAndReturn } from "../agencies/actions";

type PerformerOption = { id: string; name: string; photoUrl?: string | null };
type CastEntry = { id: string; name: string; photoUrl?: string | null; role: string };
type Tab = "general" | "cast";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tab-bar-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className="performer-select-avatar" />;
  }
  return (
    <span className="performer-select-avatar performer-select-avatar-placeholder">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function DramaForm({
  action,
  performers,
  agencies,
  defaultValues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  performers: PerformerOption[];
  agencies: EntityOption[];
  defaultValues?: {
    title: string;
    year: string;
    posterUrl: string;
    synopsis: string;
    mydramalistUrl: string;
    agencyId: string;
    cast: CastEntry[];
  };
  submitLabel: string;
}) {
  const v = defaultValues;

  const [activeTab, setActiveTab] = useState<Tab>("general");

  const [createdPerformers, setCreatedPerformers] = useState<PerformerOption[]>([]);
  const allPerformers = useMemo(
    () => [...performers, ...createdPerformers.filter((c) => !performers.some((p) => p.id === c.id))],
    [performers, createdPerformers],
  );

  const [cast, setCast] = useState<CastEntry[]>(v?.cast ?? []);
  const [query, setQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const comboboxRef = useRef<HTMLDivElement>(null);

  const filteredPerformers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const castIds = new Set(cast.map((c) => c.id));
    return allPerformers.filter((p) => {
      if (castIds.has(p.id)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [allPerformers, cast, query]);

  const trimmedQuery = query.trim();
  const hasExactMatch = allPerformers.some(
    (p) => p.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const showCreateOption = trimmedQuery.length > 0 && !hasExactMatch;

  function addCastMember(performer: PerformerOption) {
    setCast((prev) => {
      if (prev.some((c) => c.id === performer.id)) return prev;
      return [...prev, { id: performer.id, name: performer.name, photoUrl: performer.photoUrl, role: "" }];
    });
    setQuery("");
  }

  function removeCastMember(id: string) {
    setCast((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCastRole(id: string, role: string) {
    setCast((prev) => prev.map((c) => (c.id === id ? { ...c, role } : c)));
  }

  async function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isCreating) return;
    const newName = String(new FormData(e.currentTarget).get("newName") ?? "").trim();
    if (!newName) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await createPerformerAndReturn(newName);
      const option = { id: created.id, name: created.name, photoUrl: null };
      setCreatedPerformers((prev) => [...prev, option]);
      addCastMember(option);
      setCreatePrefill(null);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Не удалось создать");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <form
      action={action}
      className="surface d-flex flex-column gap-3 p-4"
    >
      <div className="tab-bar mb-1">
        <TabButton active={activeTab === "general"} onClick={() => setActiveTab("general")}>
          Общая инфа
        </TabButton>
        <TabButton active={activeTab === "cast"} onClick={() => setActiveTab("cast")}>
          Актёрский состав
        </TabButton>
      </div>

      {/* The display-toggle lives on this outer div with no other classes —
          Bootstrap's .d-flex etc. carry !important and would otherwise beat
          an inline display:none on the same element. */}
      <div style={{ display: activeTab === "general" ? undefined : "none" }}>
      <div className="d-flex flex-column gap-3">
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

      <FileDropzone name="posterUrl" label="Постер" defaultValue={v?.posterUrl} />

      <div className="row g-3">
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
        <div className="col-12 col-lg-6">
          <EntitySelect
            name="agencyId"
            label="Агентство"
            options={agencies}
            defaultValue={v?.agencyId}
            placeholder="Не выбрано"
            createLabel="Создать агентство"
            onCreateNew={async (name) => {
              const created = await createAgencyAndReturn(name);
              return { id: created.id, name: created.name, photoUrl: created.logoUrl };
            }}
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
      </div>
      </div>

      <div style={{ display: activeTab === "cast" ? undefined : "none" }}>
        <label className="form-label d-block">Актёрский состав</label>

        {cast.length > 0 && (
          <div className="d-flex flex-column gap-2 mb-2">
            {cast.map((c) => (
              <div
                key={c.id}
                className="d-flex align-items-center gap-2 p-2 rounded-3"
                style={{ background: "var(--bs-tertiary-bg)", border: "1px solid var(--bs-border-color)" }}
              >
                <Avatar name={c.name} photoUrl={c.photoUrl} />
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

          {isDropdownOpen && (filteredPerformers.length > 0 || showCreateOption) && (
            <div className="performer-combobox-dropdown">
              {filteredPerformers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="performer-combobox-option d-flex align-items-center gap-2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addCastMember(p)}
                >
                  <Avatar name={p.name} photoUrl={p.photoUrl} />
                  {p.name}
                </button>
              ))}
              {showCreateOption && (
                <button
                  type="button"
                  className="performer-combobox-option performer-combobox-create"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setCreatePrefill(trimmedQuery);
                    setIsDropdownOpen(false);
                  }}
                >
                  {`+ Создать «${trimmedQuery}»`}
                </button>
              )}
            </div>
          )}
        </div>

        {allPerformers.length === 0 && (
          <p className="small text-secondary mt-2">
            Нет исполнителей. Начните вводить имя, чтобы создать нового.
          </p>
        )}
      </div>

      <Modal
        open={createPrefill !== null}
        onClose={() => setCreatePrefill(null)}
        title="Создать исполнителя"
      >
        <form className="d-flex flex-column gap-3" onSubmit={handleCreateSubmit}>
          <div>
            <label className="form-label">Имя *</label>
            <input
              name="newName"
              required
              autoFocus
              defaultValue={createPrefill ?? ""}
              className="form-control"
            />
          </div>
          {createError && <p className="small text-danger mb-0">{createError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreating}>
            {isCreating ? "Создание…" : "Создать"}
          </button>
        </form>
      </Modal>

      <div className="mt-2">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
