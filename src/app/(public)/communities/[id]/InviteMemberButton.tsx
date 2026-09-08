"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { useLocale, useT } from "@/components/LocaleProvider";
import { userDisplayName } from "@/lib/userProfile";
import {
  inviteToCommunity,
  searchInviteCandidates,
  type InviteCandidate,
} from "../memberActions";

/**
 * «Пригласить» — модалка владельца и модераторов.
 *
 * Два способа найти человека, потому что зовут по-разному: своих зовут
 * из друзей (их список открывается сразу, без единого нажатия), а
 * незнакомого по переписке — поиском по имени и нику. Так же устроен
 * поиск на странице друзей; список кандидатов собирает сервер и он же
 * вычёркивает тех, кто уже в сообществе или уже позван.
 *
 * Приглашение не зачисляет: человек получит уведомление и решит сам
 * (см. `inviteToCommunity`), поэтому кнопка называется «Позвать», а
 * строка после нажатия уезжает в «приглашены, ждём ответа».
 */
export default function InviteMemberButton({ communityId }: { communityId: string }) {
  const t = useT();
  const locale = useLocale();
  const s = t.communities.people;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Запрос, которым получен текущий список: подпись над ним разная —
   *  «ваши друзья» или «найдены». */
  const [shownQuery, setShownQuery] = useState("");
  const [candidates, setCandidates] = useState<InviteCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load(nextQuery: string) {
    startTransition(async () => {
      setError(null);
      const found = await searchInviteCandidates(communityId, nextQuery);
      setShownQuery(nextQuery.trim());
      setCandidates(found);
    });
  }

  function openModal() {
    setOpen(true);
    setQuery("");
    // Друзья — сразу при открытии: чаще всего зовут именно их, и лишнее
    // нажатие «показать друзей» было бы налогом на обычный случай.
    load("");
  }

  function invite(userId: string) {
    startTransition(async () => {
      setError(null);
      const result = await inviteToCommunity(communityId, userId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Позванный больше не кандидат — убираем его из списка сразу,
      // не дожидаясь refresh: список приглашённых обновит страница.
      setCandidates((prev) => (prev ?? []).filter((c) => c.id !== userId));
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={openModal}>
        {s.invite}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={s.inviteTitle}>
        <div className="d-flex flex-column gap-3">
          <p className="small text-secondary mb-0">{s.inviteHint}</p>

          <form
            className="d-flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              load(query);
            }}
          >
            <input
              type="search"
              className="form-control"
              value={query}
              placeholder={s.inviteSearchPlaceholder}
              aria-label={s.inviteSearchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="btn btn-primary flex-shrink-0" disabled={isPending}>
              {s.inviteSearch}
            </button>
          </form>

          <div>
            <h3 className="section-heading mb-2">
              {shownQuery ? s.inviteFound : s.inviteFriends}
            </h3>
            {candidates && candidates.length === 0 && (
              <p className="small text-secondary mb-0">
                {shownQuery ? t.common.nobodyFound : s.inviteNoFriendsLeft}
              </p>
            )}
            <div className="d-flex flex-column gap-2">
              {(candidates ?? []).map((c) => (
                <div
                  key={c.id}
                  className="surface d-flex align-items-center justify-content-between gap-2 p-2 px-3"
                >
                  <span className="text-truncate">
                    {userDisplayName(c, locale)}
                    {c.username && <span className="small text-secondary ms-2">@{c.username}</span>}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm flex-shrink-0"
                    disabled={isPending}
                    onClick={() => invite(c.id)}
                  >
                    {s.inviteSend}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="small text-danger mb-0">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
