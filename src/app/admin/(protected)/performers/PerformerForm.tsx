"use client";

import { useMemo, useState } from "react";
import EntitySelect, { type EntityOption } from "@/components/EntitySelect";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import FileDropzone from "@/components/FileDropzone";
import { createAgencyAndReturn } from "../agencies/actions";
import { createDramaAndReturn } from "../dramas/actions";
import { createPerformerAndReturn, findSimilarPerformers } from "./actions";
import DuplicateNameWarning from "@/components/DuplicateNameWarning";
import QuickCreateEventButton from "./QuickCreateEventButton";
import PairingManager from "./PairingManager";
import type { PairingStatus } from "@/generated/prisma/client";
import { detectSocialPlatform, type SocialPlatform } from "@/lib/socialLinks";

export type PerformerLinkInput = { label: string; url: string };
export type PerformerOption = { id: string; name: string; photoUrl?: string | null };

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
      className={`tab-bar-item ${active ? "active" : ""}`}
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
  currentPairings?: { id: string; label: string; status: PairingStatus }[];
}) {
  const v = defaultValues;
  const isCreating = !v;
  const [nameValue, setNameValue] = useState(v?.name ?? "");

  const [type, setType] = useState(v?.type ?? "SOLO");

  const [activeTab, setActiveTab] = useState<Tab>("general");
  // Дорамы/Пейринг don't apply to bands — if the type switches to BAND while
  // one of those is active, fall back to "general" (derived, not stored, so
  // switching type doesn't leave every panel hidden for a render).
  const effectiveTab: Tab =
    type === "BAND" && (activeTab === "dramas" || activeTab === "pairing")
      ? "general"
      : activeTab;

  // Instagram/TikTok/Twitter get their own fields below (recognized by URL,
  // not label) — everything else stays in the free-form list.
  const socialDefaults: Partial<Record<SocialPlatform, string>> = {};
  const genericLinkDefaults: PerformerLinkInput[] = [];
  for (const l of v?.links ?? []) {
    const platform = detectSocialPlatform(l.url);
    if (platform) socialDefaults[platform] = l.url;
    else genericLinkDefaults.push(l);
  }

  const [links, setLinks] = useState<PerformerLinkInput[]>(
    genericLinkDefaults.length > 0 ? genericLinkDefaults : [{ label: "", url: "" }],
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

  // Solo performers created inline via the pairing-partner picker, merged in
  // so PairingManager's own picker sees them too.
  const [createdMembers, setCreatedMembers] = useState<PerformerOption[]>([]);
  const allSoloPerformers = useMemo(
    () => [...soloPerformers, ...createdMembers.filter((c) => !soloPerformers.some((p) => p.id === c.id))],
    [soloPerformers, createdMembers],
  );

  // --- Events picker (quick-create needs a modal, so it feeds
  // EntityMultiSelect via externalAdditions rather than onCreateNew) ---
  const [createdEvents, setCreatedEvents] = useState<EntityOption[]>([]);

  return (
    <form
      action={action}
      className="surface d-flex flex-column gap-3 p-4"
    >
      <div className="tab-bar mb-1">
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
          switching tabs. The display-toggle lives on this outer div with no
          other classes — Bootstrap's .d-flex etc. carry !important and would
          otherwise beat an inline display:none on the same element. */}
      <div style={{ display: effectiveTab === "general" ? undefined : "none" }}>
      <div className="d-flex flex-column gap-3">
        <div className="row g-3">
          <div className="col-12 col-lg-8">
            <label className="form-label">Имя / название группы *</label>
            <input
              name="name"
              required
              defaultValue={v?.name}
              onChange={(e) => setNameValue(e.target.value)}
              className="form-control"
            />
            {isCreating && (
              <DuplicateNameWarning
                value={nameValue}
                checkAction={findSimilarPerformers}
                editHrefBase="/admin/performers"
              />
            )}
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

        <div className="row g-3">
          <div className="col-12 col-md-8">
            <label className="form-label">{type === "BAND" ? "О группе" : "Биография"}</label>
            <textarea
              name="bio"
              rows={5}
              defaultValue={v?.bio}
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <FileDropzone name="photoUrl" label="Фото" defaultValue={v?.photoUrl} />
          </div>
        </div>

        <div>
          <label className="form-label">Ссылка на MyDramaList</label>
          <input
            type="url"
            name="mydramalistUrl"
            defaultValue={v?.mydramalistUrl}
            placeholder="https://mydramalist.com/…"
            className="form-control"
          />
        </div>

        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label">Instagram</label>
            <input
              type="url"
              name="instagramUrl"
              defaultValue={socialDefaults.instagram}
              placeholder="https://instagram.com/…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label">TikTok</label>
            <input
              type="url"
              name="tiktokUrl"
              defaultValue={socialDefaults.tiktok}
              placeholder="https://tiktok.com/@…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label">Twitter</label>
            <input
              type="url"
              name="twitterUrl"
              defaultValue={socialDefaults.twitter}
              placeholder="https://x.com/…"
              className="form-control"
            />
          </div>
        </div>

        <div>
          <label className="form-label d-block">Другие ссылки</label>
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
            <EntityMultiSelect
              name="memberIds"
              options={soloPerformers}
              defaultSelectedIds={defaultMemberIds}
              placeholder="Начните вводить имя участника…"
              createLabel="Создать исполнителя"
              emptyMessage="Нет соло-исполнителей, которых можно добавить как участников."
              onCreateNew={async (query) => {
                const created = await createPerformerAndReturn(query);
                return { id: created.id, name: created.name, photoUrl: null };
              }}
            />
          </div>
        )}
      </div>
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
