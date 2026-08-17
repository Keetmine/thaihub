"use client";

import { useState } from "react";
import EntityMultiSelect, { type EntityOption } from "@/components/EntityMultiSelect";
import FileDropzone from "@/components/FileDropzone";
import { searchDramaOptions } from "../dramas/actions";

export type NovelLinkInput = { label: string; url: string };

export default function NovelForm({
  action,
  submitLabel,
  dramas,
  defaultDramaIds,
  defaultValues,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  /** Уже привязанные экранизации (для чипов); каталог ищется асинхронно. */
  dramas: EntityOption[];
  defaultDramaIds?: string[];
  defaultValues?: {
    title: string;
    author: string;
    originalAuthor: string;
    size: string;
    tags: string;
    coverUrl: string;
    description: string;
    links: NovelLinkInput[];
  };
}) {
  const v = defaultValues;
  const [links, setLinks] = useState<NovelLinkInput[]>(
    v?.links && v.links.length > 0 ? v.links : [{ label: "", url: "" }],
  );

  return (
    <form action={action} className="surface d-flex flex-column gap-3 p-4">
      <div className="row g-3">
        <div className="col-12 col-md-8">
          <label className="form-label">Название *</label>
          <input name="title" required defaultValue={v?.title} className="form-control" />
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label">Автор</label>
          <input name="author" defaultValue={v?.author} className="form-control" />
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label">Автор оригинала</label>
          <input name="originalAuthor" defaultValue={v?.originalAuthor} className="form-control" />
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label">Размер</label>
          <input
            name="size"
            defaultValue={v?.size}
            placeholder="1 011 страниц, 481 434 слова"
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label">Теги и метки</label>
          <input
            name="tags"
            defaultValue={v?.tags}
            placeholder="Слэш, Перевод, NC-17 — через запятую"
            className="form-control"
          />
        </div>
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
          <FileDropzone name="coverUrl" label="Обложка" defaultValue={v?.coverUrl} />
        </div>
      </div>

      <div>
        <label className="form-label d-block">Где почитать / скачать</label>
        <div className="d-flex flex-column gap-2">
          {links.map((link, i) => (
            <div key={i} className="row g-2 align-items-center">
              <div className="col-4">
                <input
                  type="text"
                  name="linkLabel"
                  placeholder="Название (Ridibooks, meb…)"
                  value={link.label}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((l, idx) => (idx === i ? { ...l, label: e.target.value } : l)),
                    )
                  }
                  className="form-control"
                />
              </div>
              <div className="col-7">
                <input
                  type="url"
                  name="linkUrl"
                  placeholder="https://…"
                  value={link.url}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((l, idx) => (idx === i ? { ...l, url: e.target.value } : l)),
                    )
                  }
                  className="form-control"
                />
              </div>
              <div className="col-1">
                <button
                  type="button"
                  className="btn btn-link btn-sm text-danger p-0"
                  onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-link btn-sm p-0 mt-1"
          onClick={() => setLinks((prev) => [...prev, { label: "", url: "" }])}
        >
          + Добавить ссылку
        </button>
      </div>

      <div>
        <label className="form-label d-block">Экранизации (сериалы)</label>
        <EntityMultiSelect
          name="dramaIds"
          options={dramas}
          defaultSelectedIds={defaultDramaIds}
          placeholder="Начните вводить название сериала…"
          searchOptions={searchDramaOptions}
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
