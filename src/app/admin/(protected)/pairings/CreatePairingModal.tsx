"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import PerformerSelect, { type PerformerSelectOption } from "@/components/PerformerSelect";
import { createPairing } from "./actions";

export default function CreatePairingModal({
  performers,
}: {
  performers: PerformerSelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [performerAId, setPerformerAId] = useState("");
  const [performerBId, setPerformerBId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setPerformerAId("");
    setPerformerBId("");
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!performerAId || !performerBId) {
      setError("Выберите обоих исполнителей");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("performerAId", performerAId);
      formData.set("performerBId", performerBId);
      await createPairing(formData);
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать пейринг");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + Добавить пейринг
      </button>

      <Modal open={open} onClose={close} title="Новый пейринг">
        <form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
          <div>
            <label className="form-label">Название пейринга</label>
            <input
              className="form-control"
              placeholder="Необязательно"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <PerformerSelect
            label="Исполнитель A *"
            options={performers.filter((p) => p.id !== performerBId)}
            value={performerAId}
            onChange={setPerformerAId}
          />

          <PerformerSelect
            label="Исполнитель B *"
            options={performers.filter((p) => p.id !== performerAId)}
            value={performerBId}
            onChange={setPerformerBId}
          />

          {error && <p className="small text-danger mb-0">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Создание…" : "Добавить"}
          </button>
        </form>
      </Modal>
    </>
  );
}
