"use client";

import { useMemo, useRef, useState } from "react";
import EntitySelect, { type EntityOption } from "@/components/EntitySelect";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import FileDropzone from "@/components/FileDropzone";
import { createAgencyAndReturn } from "../agencies/actions";
import { createDramaAndReturn } from "../dramas/actions";
import { createPerformerAndReturn } from "./actions";
import QuickCreateEventButton from "./QuickCreateEventButton";
import PairingManager from "./PairingManager";

export type PerformerLinkInput = { label: string; url: string };
export type PerformerOption = { id: string; name: string };

type Tab = "general" | "dramas" | "events" | "pairing";

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
      className={`mode-toggle-option ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function PerformerForm({
  action,
  submitLabel,
  soloPerformers,
  agencies,
  dramas,
  events,
  defaultValues,
  defaultMemberIds,
  defaultDramaIds,
  defaultEventIds,
  currentPairings,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  /** Existing SOLO performers, for the pairing-partner select and the band-members picker. */
  soloPerformers: PerformerOption[];
  agencies: EntityOption[];
  dramas: EntityOption[];
  events: EntityOption[];
  defaultValues?: {
    performerId: string;
    name: string;
    type: string;
    realName: string;
    birthDate: string;
    bio: string;
    agencyId: string;
    photoUrl: string;
    mydramalistUrl: string;
    links: PerformerLinkInput[];
  };
  /** Pre-filled band member ids, for editing an existing BAND performer. */
  defaultMemberIds?: string[];
  defaultDramaIds?: string[];
  defaultEventIds?: string[];
  /** Existing pairings this performer is part of — edit mode only. */
  currentPairings?: { id: string; label: string }[];
}) {
  const v = defaultValues;
  const isCreating = !v;

  const [type, setType] = useState(v?.type ?? "SOLO");

  const [activeTab, setActiveTab] = useState<Tab>("general");
  // Дорамы/Пейринг don't apply to bands — if the type switches to BAND while
  // one of those is active, fall back to "general" (derived, not stored, so
  // switching type doesn't leave every panel hidden for a render).
  const effectiveTab: Tab =
    type === "BAND" && (activeTab === "dramas" || activeTab === "pairing")
      ? "general"
      : activeTab;

  const [links, setLinks] = useState<PerformerLinkInput[]>(
    v?.links && v.links.length > 0 ? v.links : [{ label: "", url: "" }],
  );

  function addLink() {
    setLinks((prev) => [...prev, { label: "", url: "" }]);
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLink(index: number, field: "label" | "url", value: string) {
    setLinks((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  }

  // --- Band members (only relevant when type === "BAND") ---
  const [createdMembers, setCreatedMembers] = useState<PerformerOption[]>([]);
  const allSoloPerformers = useMemo(
    () => [...soloPerformers, ...createdMembers.filter((c) => !soloPerformers.some((p) => p.id === c.id))],
    [soloPerformers, createdMembers],
  );
  const [memberIds, setMemberIds] = useState<string[]>(defaultMemberIds ?? []);
  const [memberQuery, setMemberQuery] = useState("");
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  const memberComboboxRef = useRef<HTMLDivElement>(null);

  const selectedMembers = useMemo(
    () => memberIds.map((id) => allSoloPerformers.find((p) => p.id === id)).filter(
      (p): p is PerformerOption => Boolean(p),
    ),
    [memberIds, allSoloPerformers],
  );

  const filteredMemberOptions = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return allSoloPerformers.filter((p) => {
      if (memberIds.includes(p.id)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [allSoloPerformers, memberIds, memberQuery]);

  const trimmedMemberQuery = memberQuery.trim();
  const memberHasExactMatch = allSoloPerformers.some(
    (p) => p.name.toLowerCase() === trimmedMemberQuery.toLowerCase(),
  );
  const showCreateMemberOption = trimmedMemberQuery.length > 0 && !memberHasExactMatch;

  function addMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setMemberQuery("");
  }

  function removeMember(id: string) {
    setMemberIds((prev) => prev.filter((mid) => mid !== id));
  }

  async function handleCreateMember() {
    if (!trimmedMemberQuery || isCreatingMember) return;
    setIsCreatingMember(true);
    try {
      const created = await createPerformerAndReturn(trimmedMemberQuery);
      setCreatedMembers((prev) => [...prev, { id: created.id, name: created.name }]);
      addMember(created.id);
    } finally {
      setIsCreatingMember(false);
    }
  }

  // --- Events picker (quick-create needs a modal, so it feeds
  // EntityMultiSelect via externalAdditions rather than onCreateNew) ---
  const [createdEvents, setCreatedEvents] = useState<EntityOption[]>([]);

  return (
    <form
      action={action}
      className="surface d-flex flex-column gap-3 p-4"
    >
      <div className="mode-toggle mb-1">
        <TabButton active={effectiveTab === "general"} onClick={() => setActiveTab("general")}>
          Общая инфа
        </TabButton>
        {type === "SOLO" && (
          <TabButton active={effectiveTab === "dramas"} onClick={() => setActiveTab("dramas")}>
            Сериалы
          </TabButton>
        )}
        <TabButton active={effectiveTab === "events"} onClick={() => setActiveTab("events")}>
          Евенты
        </TabButton>
        {type === "SOLO" && (
          <TabButton active={effectiveTab === "pairing"} onClick={() => setActiveTab("pairing")}>
            Пейринг
          </TabButton>
        )}
      </div>

      {/* Every tab stays mounted (display:none when inactive) so uncontrolled
          fields like FileDropzone/EntitySelect don't lose their state when
          switching tabs. */}
      <div
        className="d-flex flex-column gap-3"
        style={{ display: effectiveTab === "general" ? undefined : "none" }}
      >
        <div className="row g-3">
          <div className="col-12 col-lg-8">
            <label className="form-label">Имя / название группы *</label>
            <input
              name="name"
              required
              defaultValue={v?.name}
              className="form-control"
            />
          </div>
          <div className="col-12 col-lg-4">
            <label className="form-label">Тип</label>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="form-select"
            >
              <option value="SOLO">Соло</option>
              <option value="BAND">Группа</option>
            </select>
          </div>
        </div>

        {type === "SOLO" && (
          <div>
            <label className="form-label">Настоящее имя</label>
            <input
              name="realName"
              defaultValue={v?.realName}
              placeholder="Если сценическое имя отличается от настоящего"
              className="form-control"
            />
          </div>
        )}

        {type === "SOLO" && (
          <div className="row g-3">
            <div className="col-12 col-sm-6">
              <label className="form-label">Дата рождения</label>
              <input
                type="date"
                name="birthDate"
                defaultValue={v?.birthDate}
                className="form-control"
              />
            </div>
            <div className="col-12 col-sm-6">
              <EntitySelect
                name="agencyId"
                label="Агентство"
                options={agencies}
                defaultValue={v?.agencyId}
                placeholder="Не выбрано"
                createLabel="Создать агентство"
                onCreateNew={async (query) => {
                  const created = await createAgencyAndReturn(query);
                  return { id: created.id, name: created.name, photoUrl: created.logoUrl };
                }}
              />
            </div>
          </div>
        )}

        {type === "BAND" && (
          <EntitySelect
            name="agencyId"
            label="Агентство"
            options={agencies}
            defaultValue={v?.agencyId}
            placeholder="Не выбрано"
            createLabel="Создать агентство"
            onCreateNew={async (query) => {
              const created = await createAgencyAndReturn(query);
              return { id: created.id, name: created.name, photoUrl: created.logoUrl };
            }}
          />
        )}

        <FileDropzone name="photoUrl" label="Фото" defaultValue={v?.photoUrl} />

        <div>
          <label className="form-label">{type === "BAND" ? "О группе" : "Биография"}</label>
          <textarea
            name="bio"
            rows={4}
            defaultValue={v?.bio}
            className="form-control"
          />
        </div>

        <input
          type="hidden"
          name="mydramalistUrl"
          defaultValue={v?.mydramalistUrl ?? ""}
        />

        <div>
          <label className="form-label d-block">Ссылки</label>
          <div className="d-flex flex-column gap-2">
            {links.map((link, i) => (
              <div key={i} className="row g-2 align-items-center">
                <div className="col-4">
                  <input
                    type="text"
                    name="linkLabel"
                    placeholder="Название (Instagram, X…)"
                    value={link.label}
                    onChange={(e) => updateLink(i, "label", e.target.value)}
                    className="form-control"
                  />
                </div>
                <div className="col-7">
                  <input
                    type="url"
                    name="linkUrl"
                    placeholder="https://…"
                    value={link.url}
                    onChange={(e) => updateLink(i, "url", e.target.value)}
                    className="form-control"
                  />
                </div>
                <div className="col-1">
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => removeLink(i)}
                    aria-label="Удалить ссылку"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm mt-2"
            onClick={addLink}
          >
            + Добавить ссылку
          </button>
        </div>

        {type === "BAND" && (
          <div>
            <label className="form-label d-block">Участники группы</label>

            {selectedMembers.length > 0 && (
              <div className="d-flex flex-wrap gap-2 mb-2">
                {selectedMembers.map((m) => (
                  <span key={m.id} className="event-chip performer-chip">
                    {m.name}
                    <input type="hidden" name="memberIds" value={m.id} />
                    <button
                      type="button"
                      className="performer-chip-remove"
                      onClick={() => removeMember(m.id)}
                      aria-label={`Убрать ${m.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="performer-combobox" ref={memberComboboxRef}>
              <input
                type="text"
                className="form-control"
                placeholder="Начните вводить имя участника…"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                onFocus={() => setIsMemberDropdownOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setIsMemberDropdownOpen(false), 150);
                }}
              />

              {isMemberDropdownOpen && (filteredMemberOptions.length > 0 || showCreateMemberOption) && (
                <div className="performer-combobox-dropdown">
                  {filteredMemberOptions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="performer-combobox-option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addMember(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                  {showCreateMemberOption && (
                    <button
                      type="button"
                      className="performer-combobox-option performer-combobox-create"
                      onMouseDown={(e) => e.preventDefault()}
                      disabled={isCreatingMember}
                      onClick={handleCreateMember}
                    >
                      {isCreatingMember ? "Создание…" : `+ Создать «${trimmedMemberQuery}»`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {allSoloPerformers.length === 0 && (
              <p className="small text-secondary mt-2">
                Нет соло-исполнителей, которых можно добавить как участников.
              </p>
            )}
          </div>
        )}
      </div>

      {type === "SOLO" && (
        <div style={{ display: effectiveTab === "dramas" ? undefined : "none" }}>
          <label className="form-label d-block">Сериалы</label>
          <EntityMultiSelect
            name="dramaIds"
            options={dramas}
            defaultSelectedIds={defaultDramaIds}
            placeholder="Начните вводить название сериала…"
            createLabel="Создать сериал"
            onCreateNew={async (query) => {
              const created = await createDramaAndReturn(query);
              return { id: created.id, name: created.title, photoUrl: created.posterUrl };
            }}
          />
        </div>
      )}

      <div style={{ display: effectiveTab === "events" ? undefined : "none" }}>
        <label className="form-label d-block">Евенты</label>
        <EntityMultiSelect
          name="eventIds"
          options={events}
          defaultSelectedIds={defaultEventIds}
          placeholder="Начните вводить название события…"
          externalAdditions={createdEvents}
        />
        <QuickCreateEventButton
          onCreated={(event) => setCreatedEvents((prev) => [...prev, event])}
        />
      </div>

      {type === "SOLO" && (
        <div style={{ display: effectiveTab === "pairing" ? undefined : "none" }}>
          {isCreating ? (
            <>
              <label className="form-label d-block">Пейринг (необязательно)</label>
              <p className="small text-secondary mt-n1 mb-2">
                Сразу связать этого исполнителя в пару с уже существующим.
              </p>
              <div className="row g-2">
                <div className="col-12 col-sm-7">
                  <EntitySelect
                    name="pairingPartnerId"
                    options={allSoloPerformers}
                    placeholder="Не создавать пейринг"
                    createLabel="Создать исполнителя"
                    onCreateNew={async (query) => {
                      const created = await createPerformerAndReturn(query);
                      setCreatedMembers((prev) => [...prev, { id: created.id, name: created.name }]);
                      return { id: created.id, name: created.name, photoUrl: null };
                    }}
                  />
                </div>
                <div className="col-12 col-sm-5">
                  <input
                    type="text"
                    name="pairingName"
                    placeholder="Название пейринга (необязательно)"
                    className="form-control"
                  />
                </div>
              </div>
            </>
          ) : v ? (
            <PairingManager
              performerId={v.performerId}
              currentPairings={currentPairings ?? []}
              soloPerformers={allSoloPerformers}
            />
          ) : null}
        </div>
      )}

      <div className="mt-2">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
