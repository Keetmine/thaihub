"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import {
  addTripMember,
  removeTripMember,
  leaveTrip,
  acceptTripInvite,
  declineTripInvite,
} from "./actions";

export type TripMemberData = { id: string; name: string | null; pending?: boolean };

/** «Участники (N)» — модалка совместной поездки: владелец добавляет
 *  друзей и убирает участников, участник может выйти сам. */
export default function TripMembersButton({
  tripId,
  isOwner,
  owner,
  members,
  availableFriends,
}: {
  tripId: string;
  isOwner: boolean;
  owner: TripMemberData;
  members: TripMemberData[];
  /** Друзья владельца, которых ещё нет в поездке (не-владельцу пусто). */
  availableFriends: TripMemberData[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [friendId, setFriendId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!friendId || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await addTripMember(tripId, friendId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFriendId("");
      router.refresh();
    } catch {
      setError("Не удалось добавить — попробуйте ещё раз");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Участники ({members.filter((m) => !m.pending).length + 1})
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Участники поездки">
        <div className="d-flex flex-column gap-2">
          <div className="surface d-flex align-items-center justify-content-between gap-3 p-2 px-3">
            <span>{owner.name ?? "Без имени"}</span>
            <span className="small text-secondary flex-shrink-0">организатор</span>
          </div>
          {members.map((m) => (
            <div
              key={m.id}
              className="surface d-flex align-items-center justify-content-between gap-3 p-2 px-3"
            >
              <span>
                {m.name ?? "Без имени"}
                {m.pending && (
                  <span className="small text-secondary ms-2">приглашение отправлено</span>
                )}
              </span>
              {isOwner && (
                <ConfirmForm
                  action={async () => {
                    // Ошибку возвращаем ConfirmForm — она покажет её в
                    // модалке подтверждения ({ error } из результата).
                    const result = await removeTripMember(tripId, m.id);
                    if (!result.ok) return result;
                    router.refresh();
                  }}
                  confirmMessage={
                    m.pending
                      ? `Отменить приглашение для ${m.name ?? "друга"}?`
                      : `Убрать ${m.name ?? "участника"} из поездки?`
                  }
                >
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger flex-shrink-0"
                    aria-label="Убрать из поездки"
                  >
                    <TrashIcon />
                  </button>
                </ConfirmForm>
              )}
            </div>
          ))}

          {isOwner ? (
            availableFriends.length > 0 ? (
              <>
                <div className="d-flex gap-2 mt-2">
                  <select
                    className="form-select"
                    value={friendId}
                    onChange={(e) => setFriendId(e.target.value)}
                  >
                    <option value="">Добавить друга…</option>
                    {availableFriends.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name ?? "Без имени"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary flex-shrink-0"
                    disabled={!friendId || pending}
                    onClick={handleAdd}
                  >
                    Добавить
                  </button>
                </div>
                {error && <p className="small text-danger mb-0">{error}</p>}
              </>
            ) : (
              <p className="small text-secondary mt-2 mb-0">
                Добавлять в поездку можно друзей — все друзья уже здесь или их
                пока нет.
              </p>
            )
          ) : (
            <div className="mt-2">
              <ConfirmForm
                action={async () => {
                  await leaveTrip(tripId);
                }}
                confirmMessage="Выйти из поездки?"
              >
                <button type="button" className="btn btn-outline-secondary btn-sm">
                  Покинуть поездку
                </button>
              </ConfirmForm>
            </div>
          )}
          {isOwner && (
            <p className="small text-secondary mb-0">
              Друг получит приглашение и станет участником, когда примет его.
              Участники видят план, дела и личные события поездки и могут
              добавлять свои. Чужие записи можно менять, только если автор
              разрешил это галочкой.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

/** Кнопки баннера-приглашения на странице поездки (и в списке поездок). */
export function TripInviteActions({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(action: (tripId: string) => Promise<void>) {
    if (pending) return;
    setPending(true);
    try {
      await action(tripId);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="d-flex align-items-center gap-2 flex-shrink-0">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={pending}
        onClick={() => run(acceptTripInvite)}
      >
        Принять
      </button>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        disabled={pending}
        onClick={() => run(declineTripInvite)}
      >
        Отклонить
      </button>
    </div>
  );
}
