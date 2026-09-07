"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinCommunity } from "../actions";
import { useT } from "@/components/LocaleProvider";

/**
 * «Вступить» / «Подать заявку» — подпись зависит от правил сообщества
 * (свободное вступление или по одобрению создателя).
 *
 * Выход отсюда не делается: он необратим и живёт в `ConfirmForm` с
 * вопросом — уйти из сообщества случайным кликом человек не должен.
 */
export default function JoinButton({
  communityId,
  needsApproval,
}: {
  communityId: string;
  needsApproval: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="d-flex flex-column gap-1">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            // Ошибку экшен отдаёт значением: в проде текст исключения из
            // server action до клиента не доезжает.
            const result = await joinCommunity(communityId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          })
        }
      >
        {needsApproval ? t.communities.joinRequest : t.communities.join}
      </button>
      {error && <p className="small text-danger mb-0">{error}</p>}
    </div>
  );
}
