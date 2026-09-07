"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/LocaleProvider";
import {
  acceptCommunityInvite,
  cancelCommunityInvite,
  declineCommunityInvite,
} from "../memberActions";

/**
 * «Вас зовут в это сообщество» — баннер приглашённому.
 *
 * Приглашение НЕ зачисляет человека: он должен согласиться сам. За
 * дверью закрытого сообщества чужие адреса встреч и закрытый чат —
 * оказаться там без своего ведома неприятно, а не приятно.
 *
 * Баннер живёт в левой колонке страницы, а не во вкладках: приглашённый
 * в закрытое сообщество внутрь ещё не допущен, и вкладок у него нет.
 */
export default function InviteBanner({
  communityId,
  invitedBy,
}: {
  communityId: string;
  /** Кто позвал — готовой строкой; «кто-то» страница подставляет сама. */
  invitedBy: string;
}) {
  const t = useT();
  const s = t.communities.people;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function answer(accept: boolean) {
    startTransition(async () => {
      setError(null);
      const result = accept
        ? await acceptCommunityInvite(communityId)
        : await declineCommunityInvite(communityId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="surface p-3">
      <p className="fw-medium text-white mb-1">{s.inviteBannerTitle(invitedBy)}</p>
      <p className="small text-secondary mb-2">{s.inviteBannerHint}</p>
      <div className="d-flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() => answer(true)}
        >
          {t.communities.accept}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isPending}
          onClick={() => answer(false)}
        >
          {t.communities.decline}
        </button>
      </div>
      {error && <p className="small text-danger mb-0 mt-1">{error}</p>}
    </div>
  );
}

/** «Отозвать» у строки приглашённого — для владельца и модераторов. */
export function InviteCancelButton({
  communityId,
  userId,
}: {
  communityId: string;
  userId: string;
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await cancelCommunityInvite(communityId, userId);
          router.refresh();
        })
      }
    >
      {t.communities.people.cancelInvite}
    </button>
  );
}
