"use client";

import { useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import EntityMultiSelect, { type EntityOption } from "@/components/EntityMultiSelect";
import { createPerformerAndReturn } from "../performers/actions";
import { createDramaAndReturn } from "../dramas/actions";

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

export default function AgencyForm({
  action,
  submitLabel,
  performers,
  dramas,
  defaultValues,
  defaultPerformerIds,
  defaultDramaIds,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  performers: EntityOption[];
  dramas: EntityOption[];
  defaultValues?: { name: string; logoUrl: string; description: string };
  defaultPerformerIds?: string[];
  defaultDramaIds?: string[];
}) {
  const v = defaultValues;
  const [activeTab, setActiveTab] = useState<Tab>("general");

  return (
    <form action={action} className="surface d-flex flex-column gap-3 p-4">
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
          <div>
            <label className="form-label">Название *</label>
            <input name="name" required defaultValue={v?.name} className="form-control" />
          </div>
          <div className="row g-3">
            <div className="col-12 col-md-8">
              <label className="form-label">Описание</label>
              <textarea
                name="description"
                rows={5}
                defaultValue={v?.description}
                className="form-control"
              />
            </div>
            <div className="col-12 col-md-4">
              <FileDropzone name="logoUrl" label="Логотип" defaultValue={v?.logoUrl} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: activeTab === "performers" ? undefined : "none" }}>
        <label className="form-label d-block">Актёры агентства</label>
        <EntityMultiSelect
          name="performerIds"
          options={performers}
          defaultSelectedIds={defaultPerformerIds}
          placeholder="Начните вводить имя исполнителя…"
          createLabel="Создать исполнителя"
          emptyMessage="Нет исполнителей."
          onCreateNew={async (query) => {
            const created = await createPerformerAndReturn(query);
            return { id: created.id, name: created.name, photoUrl: null };
          }}
        />
      </div>

      <div style={{ display: activeTab === "dramas" ? undefined : "none" }}>
        <label className="form-label d-block">Сериалы агентства</label>
        <EntityMultiSelect
          name="dramaIds"
          options={dramas}
          defaultSelectedIds={defaultDramaIds}
          placeholder="Начните вводить название сериала…"
          createLabel="Создать сериал"
          emptyMessage="Нет сериалов."
          onCreateNew={async (query) => {
            const created = await createDramaAndReturn(query);
            return { id: created.id, name: created.title, photoUrl: created.posterUrl };
          }}
        />
      </div>

      <div className="mt-2">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
