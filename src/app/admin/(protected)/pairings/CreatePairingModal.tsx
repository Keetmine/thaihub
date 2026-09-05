"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import EntitySelect, { type EntityOption } from "@/components/EntitySelect";
import { searchSoloPerformerOptions } from "../performers/actions";
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
    } catch {
      setError("Не удалось создать пейринг. Проверьте выбранных актёров.");
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
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        + Добавить пейринг
      </button>

      <Modal open={open} onClose={close} title="Новый пейринг">
        <form
          key={open ? "open" : "closed"}
          className="d-flex flex-column gap-3"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="form-label" htmlFor="create-pairing-modal-name">Название пейринга</label>
            <input id="create-pairing-modal-name" name="name" className="form-control" placeholder="Необязательно" />
          </div>

          <div>
            <label className="form-label" htmlFor="create-pairing-modal-status">Статус</label>
            <select id="create-pairing-modal-status" name="status" className="form-select" defaultValue="CURRENT">
              <option value="CURRENT">Текущий</option>
              <option value="PAST">Бывший</option>
            </select>
          </div>

          <EntitySelect
            name="performerAId"
            label="Исполнитель A *"
            options={performers.filter((p) => p.id !== performerBId)}
            searchOptions={async (q) =>
              (await searchSoloPerformerOptions(q)).filter((p) => p.id !== performerBId)
            }
            onChange={setPerformerAId}
            hrefKind="Performer"
            createLabel="Создать исполнителя"
            onCreateNew={handleCreatePerformer}
          />

          <EntitySelect
            name="performerBId"
            label="Исполнитель B *"
            options={performers.filter((p) => p.id !== performerAId)}
            searchOptions={async (q) =>
              (await searchSoloPerformerOptions(q)).filter((p) => p.id !== performerAId)
            }
            onChange={setPerformerBId}
            hrefKind="Performer"
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
