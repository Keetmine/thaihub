"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import EntitySelect, { type EntityOption } from "@/components/EntitySelect";
import { createPairing } from "./actions";
import { createPerformerAndReturn } from "../performers/actions";

export default function CreatePairingModal({ performers }: { performers: EntityOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [performerAId, setPerformerAId] = useState("");
  const [performerBId, setPerformerBId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setPerformerAId("");
    setPerformerBId("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!performerAId || !performerBId) {
      setError("Выберите обоих исполнителей");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const formData = new FormData(e.currentTarget);
      await createPairing(formData);
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать пейринг");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreatePerformer(query: string): Promise<EntityOption> {
    const created = await createPerformerAndReturn(query);
    return { id: created.id, name: created.name, photoUrl: null };
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + Добавить пейринг
      </button>

      <Modal open={open} onClose={close} title="Новый пейринг">
        <form
          key={open ? "open" : "closed"}
          className="d-flex flex-column gap-3"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="form-label">Название пейринга</label>
            <input name="name" className="form-control" placeholder="Необязательно" />
          </div>

          <div>
            <label className="form-label">Статус</label>
            <select name="status" className="form-select" defaultValue="CURRENT">
              <option value="CURRENT">Текущий</option>
              <option value="PAST">Бывший</option>
            </select>
          </div>

          <EntitySelect
            name="performerAId"
            label="Исполнитель A *"
            options={performers.filter((p) => p.id !== performerBId)}
            onChange={setPerformerAId}
            createLabel="Создать исполнителя"
            onCreateNew={handleCreatePerformer}
          />

          <EntitySelect
            name="performerBId"
            label="Исполнитель B *"
            options={performers.filter((p) => p.id !== performerAId)}
            onChange={setPerformerBId}
            createLabel="Создать исполнителя"
            onCreateNew={handleCreatePerformer}
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
