"use client";

import { useMemo, useRef, useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import EntitySelect, { type EntityOption } from "@/components/EntitySelect";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import Modal from "@/components/Modal";
import { createPerformerAndReturn, searchPerformerOptions } from "../performers/actions";
import { createAgencyAndReturn } from "../agencies/actions";
import { createLocationAndReturn, searchLocationOptions } from "../locations/actions";
import { searchNovelOptions, createNovelAndReturn } from "../novels/actions";
import { findSimilarDramas } from "./actions";
import DuplicateNameWarning from "@/components/DuplicateNameWarning";

type PerformerOption = { id: string; name: string; photoUrl?: string | null };
type CastEntry = { id: string; name: string; photoUrl?: string | null; role: string };
type Tab = "general" | "cast" | "locations";

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
  agencies,
  locations,
  novels,
  defaultValues,
  defaultLocationIds,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  agencies: EntityOption[];
  locations: EntityOption[];
  /** Выбранная новелла (для триггера селекта); каталог ищется асинхронно. */
  novels?: EntityOption[];
  defaultValues?: {
    title: string;
    year: string;
    posterUrl: string;
    synopsis: string;
    mydramalistUrl: string;
    agencyId: string;
    novelId: string;
    cast: CastEntry[];
    nativeTitle: string;
    alsoKnownAs: string;
    director: string;
    screenwriter: string;
    genres: string;
    tags: string;
    episodes: string;
    airedOn: string;
    duration: string;
    contentRating: string;
    network: string;
    status: string;
  };
  defaultLocationIds?: string[];
  submitLabel: string;
}) {
  const v = defaultValues;
  const isNewDrama = !v;
  const [titleValue, setTitleValue] = useState(v?.title ?? "");

  const [activeTab, setActiveTab] = useState<Tab>("general");

  const [cast, setCast] = useState<CastEntry[]>(v?.cast ?? []);
  const [query, setQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const comboboxRef = useRef<HTMLDivElement>(null);

  // Каталог актёров (~17 тыс.) больше не приходит пропсом целиком —
  // ищем на сервере по мере ввода (searchPerformerOptions), с тем же
  // дебаунсом/отбросом устаревших ответов, что в EntityMultiSelect.
  const [searchResults, setSearchResults] = useState<PerformerOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  function handleQueryChange(next: string) {
    setQuery(next);
    const q = next.trim();
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const seq = ++searchSeqRef.current;
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchPerformerOptions(q);
        if (seq === searchSeqRef.current) setSearchResults(results);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, 300);
  }

  const filteredPerformers = useMemo(() => {
    const castIds = new Set(cast.map((c) => c.id));
    return searchResults.filter((p) => !castIds.has(p.id));
  }, [searchResults, cast]);

  const trimmedQuery = query.trim();
  const hasExactMatch = searchResults.some(
    (p) => p.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const showCreateOption = trimmedQuery.length > 0 && !hasExactMatch && !isSearching;

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
      addCastMember({ id: created.id, name: created.name, photoUrl: null });
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
        <TabButton active={activeTab === "locations"} onClick={() => setActiveTab("locations")}>
          Локации
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
            onChange={(e) => setTitleValue(e.target.value)}
            className="form-control"
          />
          {isNewDrama && (
            <DuplicateNameWarning
              value={titleValue}
              checkAction={findSimilarDramas}
              editHrefBase="/admin/dramas"
            />
          )}
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
            name="novelId"
            label="Новелла-первоисточник"
            options={novels ?? []}
            defaultValue={v?.novelId}
            placeholder="Не выбрано"
            createLabel="Создать новеллу"
            searchOptions={searchNovelOptions}
            onCreateNew={async (title) => {
              const created = await createNovelAndReturn(title);
              return { id: created.id, name: created.title };
            }}
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

      <div className="row g-3">
        <div className="col-12 col-md-8">
          <label className="form-label">Синопсис</label>
          <textarea
            name="synopsis"
            rows={5}
            defaultValue={v?.synopsis}
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-4">
          <FileDropzone name="posterUrl" label="Постер" defaultValue={v?.posterUrl} />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-md-6">
          <label className="form-label">Родное название</label>
          <input name="nativeTitle" defaultValue={v?.nativeTitle} className="form-control" />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Другие названия</label>
          <input
            name="alsoKnownAs"
            defaultValue={v?.alsoKnownAs}
            placeholder="Через запятую"
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Режиссёр</label>
          <input name="director" defaultValue={v?.director} className="form-control" />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Сценарист</label>
          <input name="screenwriter" defaultValue={v?.screenwriter} className="form-control" />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Жанры</label>
          <input
            name="genres"
            defaultValue={v?.genres}
            placeholder="Comedy, Romance — через запятую"
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Теги</label>
          <input
            name="tags"
            defaultValue={v?.tags}
            placeholder="Через запятую"
            className="form-control"
          />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label">Эпизоды</label>
          <input type="number" name="episodes" defaultValue={v?.episodes} className="form-control" />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label">Длительность</label>
          <input
            name="duration"
            defaultValue={v?.duration}
            placeholder="43 min."
            className="form-control"
          />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label">День эфира</label>
          <input
            name="airedOn"
            defaultValue={v?.airedOn}
            placeholder="Thursday"
            className="form-control"
          />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label">Канал / платформа</label>
          <input name="network" defaultValue={v?.network} className="form-control" />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Возрастной рейтинг</label>
          <input
            name="contentRating"
            defaultValue={v?.contentRating}
            placeholder="15+ - Teens 15 or older"
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Статус</label>
          <select name="status" defaultValue={v?.status ?? ""} className="form-select">
            <option value="">Не указан</option>
            <option value="PLANNED">Запланирован</option>
            <option value="IN_PRODUCTION">В производстве</option>
            <option value="PILOT">Пилот</option>
            <option value="RETURNING_SERIES">Выходит</option>
            <option value="ENDED">Завершён</option>
            <option value="CANCELED">Отменён</option>
          </select>
        </div>
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
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setIsDropdownOpen(true)}
            onBlur={() => {
              // allow click on dropdown options to register before closing
              window.setTimeout(() => setIsDropdownOpen(false), 150);
            }}
          />

          {isDropdownOpen && trimmedQuery.length > 0 && filteredPerformers.length === 0 && !showCreateOption && (
            <div className="performer-combobox-dropdown">
              <div className="performer-combobox-option text-secondary" aria-disabled>
                {trimmedQuery.length < 2 ? "Введите минимум 2 символа" : isSearching ? "Поиск…" : "Никого не найдено"}
              </div>
            </div>
          )}
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

      </div>

      <div style={{ display: activeTab === "locations" ? undefined : "none" }}>
        <label className="form-label d-block">Локации съёмок</label>
        <EntityMultiSelect
          name="locationIds"
          options={locations}
          defaultSelectedIds={defaultLocationIds}
          placeholder="Начните вводить название локации…"
          createLabel="Создать локацию"
          emptyMessage="Нет локаций. Начните вводить название, чтобы создать новую."
          searchOptions={searchLocationOptions}
          onCreateNew={async (name) => {
            const created = await createLocationAndReturn(name);
            return { id: created.id, name: created.name, photoUrl: created.photoUrl };
          }}
        />
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
