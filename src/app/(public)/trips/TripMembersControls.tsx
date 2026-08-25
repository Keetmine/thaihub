"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import { useLocale, useT } from "@/components/LocaleProvider";
import { userDisplayName } from "@/lib/userProfile";
import {
  addTripMember,
  removeTripMember,
  leaveTrip,
  acceptTripInvite,
  declineTripInvite,
} from "./actions";

export type TripMemberData = {
  id: string;
  name: string | null;
  /** Признак удалённого аккаунта: подпись ему даёт userDisplayName на
   *  языке зрителя, в базе лежит русская строка со дня удаления. */
  deletedAt: Date | null;
  pending?: boolean;
};

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
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [friendId, setFriendId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Имя участника: у живого — как он себя назвал, у удалённого —
  // подпись на языке зрителя.
  const label = (person: TripMemberData) =>
    person.name ? userDisplayName(person, locale) : t.trips.members.noName;

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
      setError(t.trips.members.addFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {t.trips.members.button(members.filter((m) => !m.pending).length + 1)}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t.trips.members.title}>
        <div className="d-flex flex-column gap-2">
          <div className="surface d-flex align-items-center justify-content-between gap-3 p-2 px-3">
            <span>{label(owner)}</span>
            <span className="small text-secondary flex-shrink-0">{t.trips.members.owner}</span>
          </div>
          {members.map((m) => (
            <div
              key={m.id}
              className="surface d-flex align-items-center justify-content-between gap-3 p-2 px-3"
            >
              <span>
                {label(m)}
                {m.pending && (
                  <span className="small text-secondary ms-2">{t.trips.members.pending}</span>
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
                      ? t.trips.members.cancelInviteConfirm(
                          m.name ? userDisplayName(m, locale) : t.trips.members.someFriend,
                        )
                      : t.trips.members.removeConfirm(
                          m.name ? userDisplayName(m, locale) : t.trips.members.someMember,
                        )
                  }
                >
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger flex-shrink-0"
                    aria-label={t.trips.members.removeAria}
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
                    <option value="">{t.trips.members.addFriend}</option>
                    {availableFriends.map((f) => (
                      <option key={f.id} value={f.id}>
                        {label(f)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary flex-shrink-0"
                    disabled={!friendId || pending}
                    onClick={handleAdd}
                  >
                    {t.common.add}
                  </button>
                </div>
                {error && <p className="small text-danger mb-0">{error}</p>}
              </>
            ) : (
              <p className="small text-secondary mt-2 mb-0">{t.trips.members.noFriendsLeft}</p>
            )
          ) : (
            <div className="mt-2">
              <ConfirmForm
                action={async () => {
                  await leaveTrip(tripId);
                }}
                confirmMessage={t.trips.members.leaveConfirm}
              >
                <button type="button" className="btn btn-outline-secondary btn-sm">
                  {t.trips.members.leave}
                </button>
              </ConfirmForm>
            </div>
          )}
          {isOwner && <p className="small text-secondary mb-0">{t.trips.members.hint}</p>}
        </div>
      </Modal>
    </>
  );
}

/** Кнопки баннера-приглашения на странице поездки (и в списке поездок). */
export function TripInviteActions({ tripId }: { tripId: string }) {
  const t = useT();
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
        {t.trips.members.accept}
      </button>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        disabled={pending}
        onClick={() => run(declineTripInvite)}
      >
        {t.trips.members.decline}
      </button>
    </div>
  );
}
