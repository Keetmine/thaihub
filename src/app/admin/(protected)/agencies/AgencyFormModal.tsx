"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { PencilIcon } from "@/components/icons";
import FileDropzone from "@/components/FileDropzone";
import { createAgency, updateAgency } from "./actions";

type AgencyDefaults = { id: string; name: string; logoUrl: string; description: string };

export default function AgencyFormModal({ agency }: { agency?: AgencyDefaults }) {
  const router = useRouter();
  const isEditing = !!agency;

  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      // Reading straight from the form (not mirrored React state) so the
      // FileDropzone's hidden input value is picked up correctly.
      const formData = new FormData(e.currentTarget);
      if (isEditing) {
        await updateAgency(agency.id, formData);
      } else {
        await createAgency(formData);
      }
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить агентство");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {isEditing ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="Редактировать"
          title="Редактировать"
          onClick={() => setOpen(true)}
        >
          <PencilIcon />
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          + Добавить агентство
        </button>
      )}

      <Modal
        open={open}
        onClose={close}
        title={isEditing ? "Редактировать агентство" : "Новое агентство"}
      >
        <form key={open ? "open" : "closed"} className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
          <div>
            <label className="form-label">Название *</label>
            <input
              name="name"
              className="form-control"
              required
              defaultValue={agency?.name ?? ""}
            />
          </div>
          <FileDropzone name="logoUrl" label="Логотип" defaultValue={agency?.logoUrl ?? ""} />
          <div>
            <label className="form-label">Описание</label>
            <textarea
              name="description"
              className="form-control"
              rows={3}
              defaultValue={agency?.description ?? ""}
            />
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Сохранение…" : isEditing ? "Сохранить" : "Добавить"}
          </button>
        </form>
      </Modal>
    </>
  );
}
