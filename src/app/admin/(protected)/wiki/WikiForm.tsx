"use client";

import RichTextEditor from "@/components/RichTextEditor";

export default function WikiForm({
  action,
  submitLabel,
  defaultValues,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  defaultValues?: { title: string; content: string; published: boolean };
}) {
  const v = defaultValues;
  return (
    <form action={action} className="surface d-flex flex-column gap-3 p-4">
      <div>
        <label className="form-label">Заголовок *</label>
        <input name="title" required defaultValue={v?.title} className="form-control" />
      </div>
      <div>
        <label className="form-label">Текст статьи</label>
        <RichTextEditor name="content" defaultValue={v?.content ?? ""} />
      </div>
      <div className="form-check">
        <input
          type="checkbox"
          className="form-check-input"
          id="published"
          name="published"
          defaultChecked={v?.published}
        />
        <label className="form-check-label small" htmlFor="published">
          Опубликована (видна в футере и по ссылке)
        </label>
      </div>
      <div>
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
