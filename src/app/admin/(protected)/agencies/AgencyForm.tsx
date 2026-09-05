"use client";

import { useRef, useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import EntityMultiSelect, { type EntityOption } from "@/components/EntityMultiSelect";
import FormSection from "@/components/admin/FormSection";
import SubmitButton from "@/components/admin/SubmitButton";
import useUnsavedGuard from "@/components/admin/UnsavedGuard";
import { createPerformerAndReturn, searchPerformerOptions } from "../performers/actions";
import { createDramaAndReturn, searchDramaOptions } from "../dramas/actions";

type Tab = "general" | "performers" | "dramas";

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

type LinkRow = { label: string; url: string };

export default function AgencyForm({
  action,
  submitLabel,
  performers,
  dramas,
  defaultValues,
  defaultPerformerIds,
  defaultDramaIds,
  defaultLinks,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  performers: EntityOption[];
  dramas: EntityOption[];
  defaultValues?: { name: string; logoUrl: string; description: string };
  defaultPerformerIds?: string[];
  defaultDramaIds?: string[];
  defaultLinks?: LinkRow[];
}) {
  const v = defaultValues;
  const [activeTab, setActiveTab] = useState<Tab>("general");

  const [links, setLinks] = useState<LinkRow[]>(
    defaultLinks && defaultLinks.length > 0 ? defaultLinks : [{ label: "", url: "" }],
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

  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useUnsavedGuard(formRef);

  return (
    <form ref={formRef} action={action} className="surface d-flex flex-column gap-3 p-4">
      <div className="tab-bar mb-1">
        <TabButton active={activeTab === "general"} onClick={() => setActiveTab("general")}>
          Общая инфа
        </TabButton>
        <TabButton active={activeTab === "performers"} onClick={() => setActiveTab("performers")}>
          Актёры
        </TabButton>
        <TabButton active={activeTab === "dramas"} onClick={() => setActiveTab("dramas")}>
          Сериалы
        </TabButton>
      </div>

      {/* The display-toggle lives on this outer div with no other classes —
          Bootstrap's .d-flex etc. carry !important and would otherwise beat
          an inline display:none on the same element. */}
      <div style={{ display: activeTab === "general" ? undefined : "none" }}>
        <div className="d-flex flex-column gap-3">
          <FormSection title="Основное" hint="название агентства или студии">
            <div>
              <label className="form-label" htmlFor="agency-form-name">Название *</label>
              <input id="agency-form-name" name="name" required defaultValue={v?.name} className="form-control" />
            </div>
          </FormSection>
          <FormSection title="Описание и логотип">
            <div className="row g-3">
              <div className="col-12 col-md-8">
                <label className="form-label" htmlFor="agency-form-description">Описание</label>
                <textarea id="agency-form-description"
                  name="description"
                  rows={5}
                  defaultValue={v?.description}
                  className="form-control"
                />
              </div>
              <div className="col-12 col-md-4">
                <FileDropzone name="logoUrl" label="Логотип" defaultValue={v?.logoUrl} compact />
              </div>
            </div>
          </FormSection>
          <FormSection
            title="Ссылки"
            hint="сайт и соцсети — известные соцсети покажутся иконками"
          >
            <div>
              {/* Заголовок группы, а не подпись поля: строки можно удалить
                  все до одной, и htmlFor указывал бы в пустоту (см.
                  tests/e2e/form-labels.spec.ts). Подписи несут сами поля
                  через aria-label. */}
              <div className="d-flex flex-column gap-2">
                {links.map((link, i) => (
                  <div key={i} className="row g-2 align-items-center">
                    <div className="col-4">
                      <input
                        type="text"
                        name="linkLabel"
                        aria-label="Название ссылки"
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
                        aria-label="Адрес ссылки"
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
        </div>
      </div>

      <div style={{ display: activeTab === "performers" ? undefined : "none" }}>
        <label className="form-label d-block" htmlFor="agency-form-performerIds">Актёры агентства</label>
        <EntityMultiSelect id="agency-form-performerIds"
          name="performerIds"
          options={performers}
          defaultSelectedIds={defaultPerformerIds}
          placeholder="Начните вводить имя исполнителя…"
          createLabel="Создать исполнителя"
          emptyMessage="Нет исполнителей."
          hrefKind="Performer"
          searchOptions={searchPerformerOptions}
          onCreateNew={async (query) => {
            const created = await createPerformerAndReturn(query);
            return { id: created.id, name: created.name, photoUrl: null };
          }}
        />
      </div>

      <div style={{ display: activeTab === "dramas" ? undefined : "none" }}>
        <label className="form-label d-block" htmlFor="agency-form-dramaIds">Сериалы агентства</label>
        <EntityMultiSelect id="agency-form-dramaIds"
          name="dramaIds"
          options={dramas}
          defaultSelectedIds={defaultDramaIds}
          placeholder="Начните вводить название сериала…"
          createLabel="Создать сериал"
          emptyMessage="Нет сериалов."
          hrefKind="Drama"
          searchOptions={searchDramaOptions}
          onCreateNew={async (query) => {
            const created = await createDramaAndReturn(query);
            return { id: created.id, name: created.title, photoUrl: created.posterUrl };
          }}
        />
      </div>

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
