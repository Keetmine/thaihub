"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EntitySelect from "@/components/EntitySelect";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import { createPairing, deletePairing, setPairingStatus } from "../pairings/actions";
import { createPerformerAndReturn } from "./actions";
import type { PerformerOption } from "./PerformerForm";
import type { PairingStatus } from "@/generated/prisma/client";

export default function PairingManager({
  performerId,
  currentPairings,
  soloPerformers,
}: {
  performerId: string;
  currentPairings: { id: string; label: string; status: PairingStatus }[];
  soloPerformers: PerformerOption[];
}) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState("");
  const [pairingName, setPairingName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!partnerId) {
      setError("Выберите партнёра");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("performerAId", performerId);
      fd.set("performerBId", partnerId);
      fd.set("name", pairingName);
      await createPairing(fd);
      setPartnerId("");
      setPairingName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать пейринг");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await deletePairing(id);
    router.refresh();
  }

  async function handleToggleStatus(id: string, next: PairingStatus) {
    await setPairingStatus(id, next);
    router.refresh();
  }

  return (
    <div className="d-flex flex-column gap-3">
      {currentPairings.length > 0 && (
        <div className="d-flex flex-column gap-2">
          {currentPairings.map((pair) => (
            <div
              key={pair.id}
              className="surface d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <span className="font-display fw-medium text-white d-flex align-items-center gap-2">
                {pair.label}
                <span
                  className={`badge rounded-pill ${pair.status === "CURRENT" ? "text-bg-success" : "text-bg-secondary"}`}
                  style={{ fontSize: "0.65rem" }}
                >
                  {pair.status === "CURRENT" ? "Текущий" : "Бывший"}
                </span>
              </span>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    handleToggleStatus(pair.id, pair.status === "CURRENT" ? "PAST" : "CURRENT")
                  }
                >
                  {pair.status === "CURRENT" ? "Отметить бывшим" : "Отметить текущим"}
                </button>
                <ConfirmForm
                  action={() => handleDelete(pair.id)}
                  confirmMessage={`Удалить пейринг «${pair.label}»?`}
                >
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    aria-label="Удалить"
                    title="Удалить"
                  >
                    <TrashIcon />
                  </button>
                </ConfirmForm>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="form-label d-block">Добавить в пейринг</label>
        <div className="row g-2 align-items-start">
          <div className="col-12 col-sm-7">
            <EntitySelect
              name="_partnerId"
              options={soloPerformers}
              defaultValue=""
              placeholder="Выберите партнёра"
              createLabel="Создать исполнителя"
              onChange={setPartnerId}
              onCreateNew={async (query) => {
                const created = await createPerformerAndReturn(query);
                return { id: created.id, name: created.name, photoUrl: null };
              }}
            />
          </div>
          <div className="col-12 col-sm-5">
            <input
              type="text"
              value={pairingName}
              onChange={(e) => setPairingName(e.target.value)}
              placeholder="Название пейринга (необязательно)"
              className="form-control"
            />
          </div>
        </div>
        {error && <p className="small text-danger mt-2 mb-0">{error}</p>}
        <button
          type="button"
          className="btn btn-primary btn-sm mt-2"
          disabled={isSubmitting}
          onClick={handleAdd}
        >
          {isSubmitting ? "Добавление…" : "Добавить"}
        </button>
      </div>
    </div>
  );
}
