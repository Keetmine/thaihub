"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerJoinRequest } from "../actions";
import { useT } from "@/components/LocaleProvider";

/**
 * Заявки на вступление — блок для владельца и модераторов сообщества,
 * где вступают «по одобрению».
 *
 * Обе кнопки решают заявку насовсем, поэтому обе шлют уведомление
 * заявителю (`answerJoinRequest`): молчание в ответ на заявку выглядит
 * хуже внятного отказа.
 */
export default function MemberRequests({
  communityId,
  requests,
}: {
  communityId: string;
  requests: { userId: string; name: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function answer(userId: string, accept: boolean) {
    startTransition(async () => {
      const result = await answerJoinRequest(communityId, userId, accept);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="mb-4">
      <h2 className="section-heading mb-2">{t.communities.requests}</h2>
      <div className="d-flex flex-column gap-2">
        {requests.map((r) => (
          <div
            key={r.userId}
            className="surface d-flex flex-wrap align-items-center justify-content-between gap-2 p-2 px-3"
          >
            <span className="text-white">{r.name}</span>
            <span className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={isPending}
                onClick={() => answer(r.userId, true)}
              >
                {t.communities.accept}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={isPending}
                onClick={() => answer(r.userId, false)}
              >
                {t.communities.decline}
              </button>
            </span>
          </div>
        ))}
      </div>
      {error && <p className="small text-danger mb-0 mt-1">{error}</p>}
    </section>
  );
}
