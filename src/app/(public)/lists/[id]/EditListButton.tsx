"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { updatePlaceList } from "../actions";
import { useT } from "@/components/LocaleProvider";

export default function EditListButton({
  list,
}: {
  list: { id: string; title: string; description: string | null };
}) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boundUpdate = updatePlaceList.bind(null, list.id);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      const result = await boundUpdate(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsOpen(false);
    } catch {
      setError(t.lists.form.saveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        {t.common.edit}
      </button>
      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title={t.lists.form.editTitle}
      >
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary">{t.lists.form.title}</label>
            <input type="text" name="title" required defaultValue={list.title} className="form-control" />
          </div>
          <div>
            <label className="form-label small text-secondary">{t.lists.form.description}</label>
            <textarea name="description" rows={2} defaultValue={list.description ?? ""} className="form-control" />
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t.lists.form.saving : t.common.save}
          </button>
        </form>
      </Modal>
    </>
  );
}
