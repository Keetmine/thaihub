"use client";

import { useRef, useState } from "react";
import EntityMultiSelect, { type EntityOption } from "@/components/EntityMultiSelect";
import FileDropzone from "@/components/FileDropzone";
import FormSection from "@/components/admin/FormSection";
import SubmitButton from "@/components/admin/SubmitButton";
import useUnsavedGuard from "@/components/admin/UnsavedGuard";
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

  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useUnsavedGuard(formRef);

  return (
    <form ref={formRef} action={action} className="surface d-flex flex-column gap-3 p-4">
      <FormSection title="Основное" hint="название, авторы, размер, теги">
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
      </FormSection>

      <FormSection title="Описание и обложка">
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
      </FormSection>

      <FormSection title="Где почитать / скачать" hint="ссылки на площадки">
      <div>
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
      </FormSection>

      <FormSection title="Экранизации" hint="сериалы по этой новелле">
        <EntityMultiSelect
          name="dramaIds"
          options={dramas}
          defaultSelectedIds={defaultDramaIds}
          placeholder="Начните вводить название сериала…"
          searchOptions={searchDramaOptions}
        />
      </FormSection>

      <div className="admin-form-actions">
        <SubmitButton label={submitLabel} busyLabel="Сохранение…" className="btn btn-primary" />
        {dirty && (
          <span className="small text-secondary">
            ● Есть несохранённые изменения — они пропадут, если уйти со страницы.
          </span>
        )}
      </div>
    </form>
  );
}
