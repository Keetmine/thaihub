"use client";

import { useActionState, useId, useRef, useState } from "react";
import FormSection from "@/components/admin/FormSection";
import SubmitButton from "@/components/admin/SubmitButton";
import useUnsavedGuard from "@/components/admin/UnsavedGuard";
import FileDropzone from "@/components/FileDropzone";
import EntitySelect, { type EntityOption, OpenEntityLink } from "@/components/EntitySelect";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import { adminEntityHref } from "@/app/admin/entityHref";
import { createPerformerAndReturn, searchPerformerOptions } from "../performers/actions";
import { createAgencyAndReturn } from "../agencies/actions";
import { createLocationAndReturn, searchLocationOptions } from "../locations/actions";
import { searchNovelOptions, createNovelAndReturn } from "../novels/actions";
import { findSimilarDramas, type DramaFormState } from "./actions";
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
    return <img
  loading="lazy"
  decoding="async" src={photoUrl} alt="" className="performer-select-avatar" />;
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
  /** Серверный экшен формы: ошибка приходит значением (см. DramaFormState). */
  action: (prev: DramaFormState, formData: FormData) => Promise<DramaFormState>;
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
    agencyIds: string[];
    novelId: string;
    cast: CastEntry[];
    nativeTitle: string;
    alsoKnownAs: string;
    doramalandUrl: string;
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
  const uid = useId();
  const v = defaultValues;
  const isNewDrama = !v;
  const [titleValue, setTitleValue] = useState(v?.title ?? "");

  // Ошибка сохранения — из useActionState: брошенную из экшена ошибку
  // прод-сборка Next обезличивает, значение доходит как есть.
  const [formState, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useUnsavedGuard(formRef);
  const [activeTab, setActiveTab] = useState<Tab>("general");

  const [cast, setCast] = useState<CastEntry[]>(v?.cast ?? []);

  function addCastMember(performer: PerformerOption) {
    setCast((prev) => {
      if (prev.some((c) => c.id === performer.id)) return prev;
      return [...prev, { id: performer.id, name: performer.name, photoUrl: performer.photoUrl, role: "" }];
    });
  }

  function removeCastMember(id: string) {
    setCast((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCastRole(id: string, role: string) {
    setCast((prev) => prev.map((c) => (c.id === id ? { ...c, role } : c)));
  }

  return (
    <form
      ref={formRef}
      action={formAction}
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
      <FormSection title="Основное" hint="название, год, источник, кто снимал">
      <div className="row g-3">
        <div className="col-12 col-lg-8">
          <label className="form-label" htmlFor="drama-form-title">Название *</label>
          <input id="drama-form-title"
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
          <label className="form-label" htmlFor="drama-form-year">Год</label>
          <input id="drama-form-year"
            type="number"
            name="year"
            defaultValue={v?.year}
            className="form-control"
          />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <label className="form-label" htmlFor="drama-form-mydramalistUrl">Ссылка на MyDramaList</label>
          <input id="drama-form-mydramalistUrl"
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
            hrefKind="Novel"
            searchOptions={searchNovelOptions}
            onCreateNew={async (title) => {
              const created = await createNovelAndReturn(title);
              return { id: created.id, name: created.title };
            }}
          />
        </div>
        <div className="col-12 col-lg-6">
          <label className="form-label d-block" htmlFor="drama-form-agencyIds">Агентства / студии</label>
          <EntityMultiSelect id="drama-form-agencyIds"
            name="agencyIds"
            options={agencies}
            defaultSelectedIds={v?.agencyIds}
            placeholder="Начните вводить название студии…"
            createLabel="Создать агентство"
            hrefKind="Agency"
            onCreateNew={async (name) => {
              const created = await createAgencyAndReturn(name);
              return { id: created.id, name: created.name, photoUrl: created.logoUrl };
            }}
          />
        </div>
      </div>

      </FormSection>

      <FormSection title="Описание и постер">
      <div className="row g-3">
        <div className="col-12 col-md-8">
          <label className="form-label" htmlFor="drama-form-synopsis">Синопсис</label>
          <textarea id="drama-form-synopsis"
            name="synopsis"
            rows={5}
            defaultValue={v?.synopsis}
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-4">
          <FileDropzone name="posterUrl" label="Постер" defaultValue={v?.posterUrl} compact />
        </div>
      </div>

      </FormSection>

      {/* Русские тексты — своей секцией: их набивает парсер
          dorama.land, и когда он ошибся (взял чужое описание, опечатка
          в названии), поправить это должно быть можно здесь, а не в
          базе. См. features/doramaland-import.md. */}
      {/* Сами русские тексты переехали во вкладку «Перевод» (правка
          владельца 2026-09-10: «вынесем в новый таб, чтоб всё было в
          одном стиле»). Здесь остался только адрес источника: это не
          перевод, а ссылка, откуда он приезжает. */}
      <FormSection
        title="Источник русских текстов"
        hint="dorama.land; сами тексты — во вкладке «Перевод»"
      >
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="drama-form-doramalandUrl">Страница на dorama.land</label>
            <input
              id="drama-form-doramalandUrl"
              name="doramalandUrl"
              defaultValue={v?.doramalandUrl}
              placeholder="https://dorama.land/…"
              className="form-control"
            />
            {v?.doramalandUrl && (
              <a
                href={v.doramalandUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="small"
              >
                Открыть источник ↗
              </a>
            )}
          </div>
        </div>
      </FormSection>

      <FormSection title="Названия и авторы" hint="данные из MyDramaList">
      <div className="row g-3">
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="drama-form-nativeTitle">Родное название</label>
          <input id="drama-form-nativeTitle" name="nativeTitle" defaultValue={v?.nativeTitle} className="form-control" />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="drama-form-alsoKnownAs">Другие названия</label>
          <input id="drama-form-alsoKnownAs"
            name="alsoKnownAs"
            defaultValue={v?.alsoKnownAs}
            placeholder="Через запятую"
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="drama-form-director">Режиссёр</label>
          <input id="drama-form-director" name="director" defaultValue={v?.director} className="form-control" />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="drama-form-screenwriter">Сценарист</label>
          <input id="drama-form-screenwriter" name="screenwriter" defaultValue={v?.screenwriter} className="form-control" />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="drama-form-genres">Жанры</label>
          <input id="drama-form-genres"
            name="genres"
            defaultValue={v?.genres}
            placeholder="Comedy, Romance — через запятую"
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="drama-form-tags">Теги</label>
          <input id="drama-form-tags"
            name="tags"
            defaultValue={v?.tags}
            placeholder="Через запятую"
            className="form-control"
          />
        </div>
        </div>
      </FormSection>

      <FormSection title="Эфир и классификация" hint="эпизоды, канал, рейтинг, статус">
      <div className="row g-3">
        <div className="col-6 col-md-3">
          <label className="form-label" htmlFor="drama-form-episodes">Эпизоды</label>
          <input id="drama-form-episodes" type="number" name="episodes" defaultValue={v?.episodes} className="form-control" />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label" htmlFor="drama-form-duration">Длительность</label>
          <input id="drama-form-duration"
            name="duration"
            defaultValue={v?.duration}
            placeholder="43 min."
            className="form-control"
          />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label" htmlFor="drama-form-airedOn">День эфира</label>
          <input id="drama-form-airedOn"
            name="airedOn"
            defaultValue={v?.airedOn}
            placeholder="Thursday"
            className="form-control"
          />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label" htmlFor="drama-form-network">Канал / платформа</label>
          <input id="drama-form-network" name="network" defaultValue={v?.network} className="form-control" />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="drama-form-contentRating">Возрастной рейтинг</label>
          <input id="drama-form-contentRating"
            name="contentRating"
            defaultValue={v?.contentRating}
            placeholder="15+ - Teens 15 or older"
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label" htmlFor="drama-form-status">Статус</label>
          <select id="drama-form-status" name="status" defaultValue={v?.status ?? ""} className="form-select">
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
      </FormSection>
      </div>
      </div>

      <div style={{ display: activeTab === "cast" ? undefined : "none" }}>
        <label className="form-label d-block" htmlFor={`${uid}-cast`}>
          Актёрский состав
        </label>

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
                  aria-label={`Роль: ${c.name}`}
                  placeholder="Роль (персонаж, необязательно)"
                  value={c.role}
                  onChange={(e) => updateCastRole(c.id, e.target.value)}
                />
                <OpenEntityLink href={adminEntityHref("Performer", c.id)!} name={c.name} compact />
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

        {/* Каталог актёров (~17 тыс.) не приходит пропсом целиком — общий
            комбобокс ищет на сервере по мере ввода. Режим onPick: выбор
            хранится здесь (у записи состава есть своё поле «роль»). */}
        <EntityMultiSelect
          id={`${uid}-cast`}
          options={[]}
          searchOptions={searchPerformerOptions}
          excludeIds={cast.map((c) => c.id)}
          onPick={addCastMember}
          hrefKind="Performer"
          placeholder="Начните вводить имя исполнителя…"
          createLabel="Создать исполнителя"
          createNameLabel="Имя"
          onCreateNew={async (newName) => {
            const created = await createPerformerAndReturn(newName);
            return { id: created.id, name: created.name, photoUrl: null };
          }}
        />

      </div>

      <div style={{ display: activeTab === "locations" ? undefined : "none" }}>
        <label className="form-label d-block" htmlFor="drama-form-locationIds">Локации съёмок</label>
        <EntityMultiSelect id="drama-form-locationIds"
          name="locationIds"
          options={locations}
          defaultSelectedIds={defaultLocationIds}
          placeholder="Начните вводить название локации…"
          createLabel="Создать локацию"
          emptyMessage="Нет локаций. Начните вводить название, чтобы создать новую."
          hrefKind="Location"
          searchOptions={searchLocationOptions}
          onCreateNew={async (name) => {
            const created = await createLocationAndReturn(name);
            return { id: created.id, name: created.name, photoUrl: created.photoUrl };
          }}
        />
      </div>

      {formState?.error && (
        <div className="alert alert-danger mb-0 py-2" role="alert">
          {formState.error}
        </div>
      )}
      <div className="admin-form-actions">
        <SubmitButton label={submitLabel} busyLabel="Сохранение…" className="btn btn-primary" />
        <span className="small text-secondary">
          {dirty
            ? "● Есть несохранённые изменения — они пропадут, если уйти со страницы."
            : "Все вкладки сохраняются одной кнопкой."}
        </span>
      </div>
    </form>
  );
}
