"use client";

import { useState } from "react";

export type PerformerLinkInput = { label: string; url: string };

export default function PerformerForm({
  action,
  submitLabel,
  defaultValues,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  defaultValues?: {
    name: string;
    type: string;
    birthDate: string;
    bio: string;
    agency: string;
    photoUrl: string;
    mydramalistUrl: string;
    links: PerformerLinkInput[];
  };
}) {
  const v = defaultValues;

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

  return (
    <form
      action={action}
      className="surface d-flex flex-column gap-3 p-4"
      style={{ maxWidth: "50rem" }}
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
          <select name="type" defaultValue={v?.type ?? "SOLO"} className="form-select">
            <option value="SOLO">Соло</option>
            <option value="BAND">Группа</option>
          </select>
        </div>
      </div>

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
          <label className="form-label">Агентство</label>
          <input
            name="agency"
            defaultValue={v?.agency}
            className="form-control"
          />
        </div>
      </div>

      <div>
        <label className="form-label">Фото (ссылка)</label>
        <input
          type="url"
          name="photoUrl"
          defaultValue={v?.photoUrl}
          placeholder="https://…"
          className="form-control"
        />
      </div>

      <div>
        <label className="form-label">Биография</label>
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

      <div className="mt-2">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
