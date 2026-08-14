"use client";

import FileDropzone from "@/components/FileDropzone";

export default function LocationForm({
  action,
  submitLabel,
  defaultValues,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  defaultValues?: { name: string; description: string; photoUrl: string };
}) {
  const v = defaultValues;

  return (
    <form action={action} className="surface d-flex flex-column gap-3 p-4">
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
          <FileDropzone name="photoUrl" label="Фото" defaultValue={v?.photoUrl} />
        </div>
      </div>

      <div className="mt-2">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
