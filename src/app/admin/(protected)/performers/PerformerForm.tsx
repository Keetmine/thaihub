"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import EntitySelect, { type EntityOption } from "@/components/EntitySelect";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import FileDropzone from "@/components/FileDropzone";
import { createAgencyAndReturn } from "../agencies/actions";
import { createDramaAndReturn, searchDramaOptions } from "../dramas/actions";
import { searchEventOptions } from "../events/actions";
import { searchSoloPerformerOptions } from "./actions";
import { createPerformerAndReturn, findSimilarPerformers } from "./actions";
import FormSection from "@/components/admin/FormSection";
import SubmitButton from "@/components/admin/SubmitButton";
import useUnsavedGuard from "@/components/admin/UnsavedGuard";
import DuplicateNameWarning from "@/components/DuplicateNameWarning";
import QuickCreateEventButton from "./QuickCreateEventButton";
import PairingManager from "./PairingManager";
import type { PairingStatus } from "@/generated/prisma/client";
import { detectSocialPlatform, type SocialPlatform } from "@/lib/socialLinks";
import DatePickerInput from "@/components/DatePickerInput";

export type PerformerLinkInput = { label: string; url: string };
export type PerformerOption = { id: string; name: string; photoUrl?: string | null };

type Tab = "general" | "dramas" | "events" | "pairing" | (string & {});

/** Вкладка, живущая ВНЕ формы профиля: у музыки свои server actions и
 *  своя кнопка сохранения, а вложенные <form> в HTML запрещены — так
 *  что панель рендерится соседом формы, а таб-бар общий. */
export type ExtraTab = { key: string; label: string; content: React.ReactNode };

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
  pairingOptions,
  mascotOwnerOptions,
  defaultMascotPerformerIds,
  defaultMascotPairingIds,
  defaultDramaIds,
  defaultEventIds,
  currentPairings,
  extraTabs = [],
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
    musicAlias: string;
    alsoKnownAs: string;
    nationality: string;
    gender: string;
    birthDate: string;
    placeOfBirth: string;
    bio: string;
    agencyIds: string[];
    photoUrl: string;
    mydramalistUrl: string;
    occupation?: string;
    instruments?: string;
    soloDebut?: string;
    height?: string;
    weight?: string;
    mvAppearances?: string;
    trivia?: string;
    links: PerformerLinkInput[];
  };
  /** Pre-filled band member ids, for editing an existing BAND performer. */
  defaultMemberIds?: string[];
  /** Маскоты: варианты пейрингов (список короткий, грузится целиком) и
   *  уже привязанные владельцы (актёры/пейринги) для режима MASCOT. */
  pairingOptions?: EntityOption[];
  mascotOwnerOptions?: EntityOption[];
  defaultMascotPerformerIds?: string[];
  defaultMascotPairingIds?: string[];
  defaultDramaIds?: string[];
  defaultEventIds?: string[];
  /** Existing pairings this performer is part of — edit mode only. */
  currentPairings?: { id: string; label: string; status: PairingStatus }[];
  /** Вкладки вне формы (см. ExtraTab) — сейчас это «Музыка». */
  extraTabs?: ExtraTab[];
}) {
  const uid = useId();
  const v = defaultValues;
  const isCreating = !v;
  const [nameValue, setNameValue] = useState(v?.name ?? "");

  const [type, setType] = useState(v?.type ?? "SOLO");

  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useUnsavedGuard(formRef);
  // Какой раздел уходит на сервер. Пишем прямо в DOM, а не через
  // состояние: onClick срабатывает до отправки формы синхронно, а
  // setState к моменту submit мог бы ещё не примениться.
  const scopeRef = useRef<HTMLInputElement>(null);
  const setScope = useCallback(
    (scope: "all" | "general" | "dramas" | "events") => () => {
      if (scopeRef.current) scopeRef.current.value = scope;
    },
    [],
  );
  const [activeTab, setActiveTab] = useState<Tab>("general");

  /** Правки всех вкладок сохраняются одной кнопкой — при уходе на
   *  другую вкладку ничего не теряется, но пользователь должен видеть,
   *  что несохранённое есть. */
  function switchTab(next: Tab) {
    setActiveTab(next);
  }
  // Дорамы/Пейринг don't apply to bands — if the type switches to BAND while
  // one of those is active, fall back to "general" (derived, not stored, so
  // switching type doesn't leave every panel hidden for a render).
  const effectiveTab: Tab =
    type !== "SOLO" && (activeTab === "dramas" || activeTab === "pairing")
      ? "general"
      : activeTab;
  const activeExtra = extraTabs.find((t) => t.key === effectiveTab) ?? null;

  // Instagram/TikTok/Twitter get their own fields below (recognized by URL,
  // not label) — everything else stays in the free-form list.
  const socialDefaults: Partial<Record<SocialPlatform, string>> = {};
  const genericLinkDefaults: PerformerLinkInput[] = [];
  for (const l of v?.links ?? []) {
    const platform = detectSocialPlatform(l.url);
    if (platform && socialDefaults[platform] === undefined) {
      socialDefaults[platform] = l.url;
    } else {
      // Второй профиль той же сети НЕ перезаписывает поле, а падает в
      // общий список: раньше он был невидим в форме и молча удалялся
      // сохранением (deleteMany + пересоздание из формы) — задвоенную
      // ссылку нельзя было ни увидеть, ни удалить руками.
      genericLinkDefaults.push(l);
    }
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
    <div className="surface d-flex flex-column gap-3 p-4">
      <div className="tab-bar mb-1">
        <TabButton active={effectiveTab === "general"} onClick={() => switchTab("general")}>
          Общая инфа
        </TabButton>
        {type === "SOLO" && (
          <TabButton active={effectiveTab === "dramas"} onClick={() => switchTab("dramas")}>
            Сериалы
          </TabButton>
        )}
        <TabButton active={effectiveTab === "events"} onClick={() => switchTab("events")}>
          Евенты
        </TabButton>

        {type === "SOLO" && (
          <TabButton active={effectiveTab === "pairing"} onClick={() => switchTab("pairing")}>
            Пейринг
          </TabButton>
        )}
        {extraTabs.map((t) => (
          <TabButton key={t.key} active={effectiveTab === t.key} onClick={() => switchTab(t.key)}>
            {t.label}
          </TabButton>
        ))}
      </div>

      <form
        ref={formRef}
        action={action}
        className="d-flex flex-column gap-3"
        style={{ display: activeExtra ? "none" : undefined }}
      >
      {/* Раздел, который сохраняем. При создании — всё сразу: записи
          ещё нет, и делить нечего. */}
      <input type="hidden" name="scope" ref={scopeRef} defaultValue="all" />

      {/* Every tab stays mounted (display:none when inactive) so uncontrolled
          fields like FileDropzone/EntitySelect don't lose their state when
          switching tabs. The display-toggle lives on this outer div with no
          other classes — Bootstrap's .d-flex etc. carry !important and would
          otherwise beat an inline display:none on the same element. */}
      <div style={{ display: effectiveTab === "general" ? undefined : "none" }}>
      <div className="d-flex flex-column gap-3">
        <FormSection title="Основное" hint="как исполнитель называется и кто он">
        <div className="row g-3">
          <div className="col-12 col-lg-8">
            <label className="form-label" htmlFor="performer-form-name">Имя / название группы *</label>
            <input id="performer-form-name"
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
            <label className="form-label" htmlFor="performer-form-type">Тип</label>
            <select id="performer-form-type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="form-select"
            >
              <option value="SOLO">Соло</option>
              <option value="BAND">Группа</option>
              <option value="MASCOT">Маскот</option>
            </select>
          </div>
        </div>

        </FormSection>

        {type === "SOLO" && (
          <FormSection title="Профиль" hint="имена, национальность, дата и место рождения, агентства">
          <div className="row g-3">
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="performer-form-realName">Настоящее имя</label>
              <input id="performer-form-realName"
                name="realName"
                defaultValue={v?.realName}
                placeholder="Если сценическое имя отличается от настоящего"
                className="form-control"
              />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="performer-form-musicAlias">Музыкальный псевдоним</label>
              <input id="performer-form-musicAlias"
                name="musicAlias"
                defaultValue={v?.musicAlias}
                placeholder="Если выступает сольно под другим именем"
                className="form-control"
              />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="performer-form-alsoKnownAs">Также известен как</label>
              <input id="performer-form-alsoKnownAs"
                name="alsoKnownAs"
                defaultValue={v?.alsoKnownAs}
                placeholder="Другие написания имени, через запятую"
                className="form-control"
              />
            </div>
            <div className="col-6 col-sm-3">
              <label className="form-label" htmlFor="performer-form-nationality">Национальность</label>
              <input id="performer-form-nationality"
                name="nationality"
                defaultValue={v?.nationality}
                placeholder="Thai"
                className="form-control"
              />
            </div>
            <div className="col-6 col-sm-3">
              <label className="form-label" htmlFor="performer-form-gender">Пол</label>
              <select id="performer-form-gender" name="gender" defaultValue={v?.gender ?? ""} className="form-select">
                <option value="">Не указан</option>
                <option value="Male">Мужской</option>
                <option value="Female">Женский</option>
              </select>
            </div>
          </div>
          </FormSection>
        )}

        {type === "SOLO" && (
          <FormSection title="Рождение и агентства">
          <div className="row g-3">
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="performer-form-birthDate">Дата рождения</label>
              <DatePickerInput id="performer-form-birthDate" name="birthDate" defaultValue={v?.birthDate} yearsBack={100} yearsForward={0} />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="performer-form-placeOfBirth">Место рождения</label>
              <input id="performer-form-placeOfBirth"
                name="placeOfBirth"
                defaultValue={v?.placeOfBirth}
                placeholder="Bangkok, Thailand"
                className="form-control"
              />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label d-block" htmlFor="performer-form-agencyIds">Агентства</label>
              <EntityMultiSelect id="performer-form-agencyIds"
                name="agencyIds"
                options={agencies}
                defaultSelectedIds={v?.agencyIds}
                placeholder="Начните вводить название агентства…"
                createLabel="Создать агентство"
                onCreateNew={async (query) => {
                  const created = await createAgencyAndReturn(query);
                  return { id: created.id, name: created.name, photoUrl: created.logoUrl };
                }}
              />
            </div>
          </div>
          </FormSection>
        )}

        {type === "MASCOT" && (
          <div className="row g-3">
            <div className="col-12 col-sm-6">
              <label className="form-label" htmlFor="performer-form-mascot-birthDate">
                День рождения маскота
              </label>
              <DatePickerInput
                id="performer-form-mascot-birthDate"
                name="birthDate"
                defaultValue={v?.birthDate}
                yearsBack={100}
                yearsForward={0}
              />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label d-block" htmlFor="performer-form-mascotPerformerIds">Чей маскот — актёры</label>
              <EntityMultiSelect id="performer-form-mascotPerformerIds"
                name="mascotPerformerIds"
                options={mascotOwnerOptions ?? []}
                defaultSelectedIds={defaultMascotPerformerIds}
                placeholder="Начните вводить имя актёра…"
                searchOptions={searchSoloPerformerOptions}
              />
            </div>
            <div className="col-12">
              <label className="form-label d-block" htmlFor="performer-form-mascotPairingIds">Чей маскот — пейринги</label>
              <EntityMultiSelect id="performer-form-mascotPairingIds"
                name="mascotPairingIds"
                options={pairingOptions ?? []}
                defaultSelectedIds={defaultMascotPairingIds}
                placeholder="Начните вводить название пейринга…"
                emptyMessage="Пейринги создаются в разделе «Пейринги»."
              />
            </div>
          </div>
        )}

        {type === "BAND" && (
          <div>
            <label className="form-label d-block" htmlFor={`${uid}-agencyIds`}>Агентства</label>
            <EntityMultiSelect id={`${uid}-agencyIds`}
              name="agencyIds"
              options={agencies}
              defaultSelectedIds={v?.agencyIds}
              placeholder="Начните вводить название агентства…"
              createLabel="Создать агентство"
              onCreateNew={async (query) => {
                const created = await createAgencyAndReturn(query);
                return { id: created.id, name: created.name, photoUrl: created.logoUrl };
              }}
            />
          </div>
        )}

        <FormSection title="Биография и фото">
        <div className="row g-3">
          <div className="col-12 col-md-8">
            <label className="form-label" htmlFor="performer-form-bio">{type === "BAND" ? "О группе" : "Биография"}</label>
            <textarea id="performer-form-bio"
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

        </FormSection>

        <FormSection
          title="Профиль музыканта"
          hint="занятия, инструменты, рост/вес, клипы, факты — заполняется импортом с tpop.fandom, правится руками"
          collapsible
          defaultOpen={false}
        >
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label className="form-label" htmlFor="performer-form-occupation">Занятия</label>
              <input id="performer-form-occupation"
                name="occupation"
                defaultValue={v?.occupation}
                placeholder="Singer, actor — через запятую"
                className="form-control"
              />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label" htmlFor="performer-form-instruments">Инструменты</label>
              <input id="performer-form-instruments"
                name="instruments"
                defaultValue={v?.instruments}
                placeholder="Guitar, piano — через запятую"
                className="form-control"
              />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label" htmlFor="performer-form-soloDebut">Сольный дебют</label>
              <input id="performer-form-soloDebut"
                name="soloDebut"
                defaultValue={v?.soloDebut}
                placeholder="August 9, 2023"
                className="form-control"
              />
            </div>
            <div className="col-6 col-md-4">
              <label className="form-label" htmlFor="performer-form-height">Рост</label>
              <input id="performer-form-height" name="height" defaultValue={v?.height} placeholder="175 cm" className="form-control" />
            </div>
            <div className="col-6 col-md-4">
              <label className="form-label" htmlFor="performer-form-weight">Вес</label>
              <input id="performer-form-weight" name="weight" defaultValue={v?.weight} placeholder="65 kg" className="form-control" />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label" htmlFor="performer-form-mvAppearances">Появления в клипах</label>
              <textarea id="performer-form-mvAppearances"
                name="mvAppearances"
                rows={3}
                defaultValue={v?.mvAppearances}
                placeholder="По одному пункту на строку"
                className="form-control"
              />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label" htmlFor="performer-form-trivia">Факты</label>
              <textarea id="performer-form-trivia"
                name="trivia"
                rows={3}
                defaultValue={v?.trivia}
                placeholder="По одному факту на строку"
                className="form-control"
              />
            </div>
          </div>
        </FormSection>

        <FormSection title="Ссылки и соцсети" hint="MyDramaList, соцсети, музыкальные площадки">
        <div>
          <label className="form-label" htmlFor="performer-form-mydramalistUrl">Ссылка на MyDramaList</label>
          <input id="performer-form-mydramalistUrl"
            type="url"
            name="mydramalistUrl"
            defaultValue={v?.mydramalistUrl}
            placeholder="https://mydramalist.com/…"
            className="form-control"
          />
        </div>

        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-instagramUrl">Instagram</label>
            <input id="performer-form-instagramUrl"
              type="url"
              name="instagramUrl"
              defaultValue={socialDefaults.instagram}
              placeholder="https://instagram.com/…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-tiktokUrl">TikTok</label>
            <input id="performer-form-tiktokUrl"
              type="url"
              name="tiktokUrl"
              defaultValue={socialDefaults.tiktok}
              placeholder="https://tiktok.com/@…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-twitterUrl">Twitter</label>
            <input id="performer-form-twitterUrl"
              type="url"
              name="twitterUrl"
              defaultValue={socialDefaults.twitter}
              placeholder="https://x.com/…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-spotifyUrl">Spotify</label>
            <input id="performer-form-spotifyUrl"
              type="url"
              name="spotifyUrl"
              defaultValue={socialDefaults.spotify}
              placeholder="https://open.spotify.com/artist/…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-applemusicUrl">Apple Music</label>
            <input id="performer-form-applemusicUrl"
              type="url"
              name="applemusicUrl"
              defaultValue={socialDefaults.applemusic}
              placeholder="https://music.apple.com/…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-youtubeUrl">YouTube</label>
            <input id="performer-form-youtubeUrl"
              type="url"
              name="youtubeUrl"
              defaultValue={socialDefaults.youtube}
              placeholder="https://youtube.com/@…"
              className="form-control"
            />
          </div>
        </div>

        <div>
          <label className="form-label d-block" htmlFor="performer-form-linkLabel">Другие ссылки</label>
          <div className="d-flex flex-column gap-2">
            {links.map((link, i) => (
              <div key={i} className="row g-2 align-items-center">
                <div className="col-4">
                  <input id="performer-form-linkLabel"
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
        </FormSection>

        {type === "BAND" && (
          <FormSection title="Состав группы">
          <div>
            <label className="form-label d-block" htmlFor="performer-form-memberIds">Участники группы</label>
            <EntityMultiSelect id="performer-form-memberIds"
              name="memberIds"
              options={soloPerformers}
              defaultSelectedIds={defaultMemberIds}
              placeholder="Начните вводить имя участника…"
              createLabel="Создать исполнителя"
              emptyMessage="Нет соло-исполнителей, которых можно добавить как участников."
              searchOptions={searchSoloPerformerOptions}
              onCreateNew={async (query) => {
                const created = await createPerformerAndReturn(query);
                return { id: created.id, name: created.name, photoUrl: null };
              }}
            />
          </div>
          </FormSection>
        )}
      </div>
      </div>

      {type === "SOLO" && (
        <div style={{ display: effectiveTab === "dramas" ? undefined : "none" }}>
          <label className="form-label d-block" htmlFor="performer-form-dramaIds">Сериалы</label>
          <EntityMultiSelect id="performer-form-dramaIds"
            name="dramaIds"
            selectedVariant="card"
            options={dramas}
            defaultSelectedIds={defaultDramaIds}
            placeholder="Начните вводить название сериала…"
            createLabel="Создать сериал"
            searchOptions={searchDramaOptions}
            onCreateNew={async (query) => {
              const created = await createDramaAndReturn(query);
              return { id: created.id, name: created.title, photoUrl: created.posterUrl };
            }}
          />
          {!isCreating && (
            <div className="admin-form-actions">
              <SubmitButton
                label="Сохранить сериалы"
                busyLabel="Сохранение…"
                className="btn btn-primary"
                onClick={setScope("dramas")}
              />
              <span className="small text-secondary">Сохраняется только эта вкладка.</span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: effectiveTab === "events" ? undefined : "none" }}>
        <label className="form-label d-block" htmlFor="performer-form-eventIds">Евенты</label>
        <EntityMultiSelect id="performer-form-eventIds"
          name="eventIds"
          selectedVariant="card"
          options={events}
          defaultSelectedIds={defaultEventIds}
          placeholder="Начните вводить название события…"
          externalAdditions={createdEvents}
          searchOptions={searchEventOptions}
        />
        <QuickCreateEventButton
          onCreated={(event) => setCreatedEvents((prev) => [...prev, event])}
        />
        {!isCreating && (
          <div className="admin-form-actions">
            <SubmitButton
              label="Сохранить евенты"
              busyLabel="Сохранение…"
              className="btn btn-primary"
              onClick={setScope("events")}
            />
            <span className="small text-secondary">Сохраняется только эта вкладка.</span>
          </div>
        )}
      </div>

      {type === "SOLO" && (
        <div style={{ display: effectiveTab === "pairing" ? undefined : "none" }}>
          {isCreating ? (
            <>
              <label className="form-label d-block" htmlFor="performer-form-pairingPartnerId">Пейринг (необязательно)</label>
              <p className="small text-secondary mt-n1 mb-2">
                Сразу связать этого исполнителя в пару с уже существующим.
              </p>
              <div className="row g-2">
                <div className="col-12 col-sm-7">
                  <EntitySelect id="performer-form-pairingPartnerId"
                    name="pairingPartnerId"
                    options={allSoloPerformers}
                    placeholder="Не создавать пейринг"
                    createLabel="Создать исполнителя"
                    searchOptions={searchSoloPerformerOptions}
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

      <div
        className="admin-form-actions"
        style={{ display: isCreating || effectiveTab === "general" ? undefined : "none" }}
      >
        <SubmitButton
          label={submitLabel}
          busyLabel="Сохранение…"
          className="btn btn-primary"
          onClick={setScope(isCreating ? "all" : "general")}
        />
        <span className="small text-secondary">
          {dirty
            ? "● Есть несохранённые изменения — они пропадут, если уйти со страницы."
            : isCreating
              ? "Всё, что заполнено на вкладках, сохранится вместе."
              : "Сериалы и евенты сохраняются своими кнопками на их вкладках."}
        </span>
      </div>
      </form>

      {extraTabs.map((t) => (
        <div key={t.key} style={{ display: effectiveTab === t.key ? undefined : "none" }}>
          {dirty && (
            <p className="admin-tab-warning small mb-3">
              ● В профиле есть несохранённые правки. Эта вкладка сохраняется
              отдельной кнопкой — вернитесь на вкладку профиля и нажмите
              «{submitLabel}», иначе правки профиля пропадут.
            </p>
          )}
          {t.content}
        </div>
      ))}
    </div>
  );
}
