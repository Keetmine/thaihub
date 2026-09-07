"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConfirmForm from "@/components/ConfirmForm";
import { useT } from "@/components/LocaleProvider";
import {
  banCommunityMember,
  setCommunityMemberRole,
  unbanCommunityMember,
} from "../memberActions";

/**
 * Кнопки у строки участника: роль, бан, снятие запрета.
 *
 * Кнопки тут только прячутся — решают всё равно экшены на сервере
 * (`memberActions.ts`): страницу можно открыть, а экшен вызвать напрямую,
 * поэтому «не показали кнопку» правом не является.
 *
 * Строка забаненного показывается в своём разделе вкладки участников:
 * она осталась в базе намеренно — без неё убранный человек вступил бы
 * заново (см. `banCommunityMember`).
 */
export default function MemberRowActions({
  communityId,
  userId,
  name,
  role,
  banned,
  viewerIsOwner,
}: {
  communityId: string;
  userId: string;
  /** Имя для вопроса «убрать такого-то?» — уже готовой строкой. */
  name: string;
  role: "OWNER" | "MODERATOR" | "MEMBER";
  banned?: boolean;
  /** Роли раздаёт только владелец — модератору эти кнопки не рисуем. */
  viewerIsOwner: boolean;
}) {
  const t = useT();
  const s = t.communities.people;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (banned) {
    return (
      <span className="d-flex align-items-center gap-2">
        {error && <span className="small text-danger">{error}</span>}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isPending}
          onClick={() => run(() => unbanCommunityMember(communityId, userId))}
        >
          {s.unban}
        </button>
      </span>
    );
  }

  // Владельца не разжалуешь и не уберёшь: сообщество осталось бы без
  // хозяина. Для этого у него есть «удалить сообщество».
  if (role === "OWNER") return null;

  // Модератора убирает только владелец — модераторы друг другу равны, и
  // разнимать их войну было бы некому. Экшен это проверяет сам, здесь
  // мы просто не показываем кнопку, которая всё равно откажет.
  const canBan = viewerIsOwner || role !== "MODERATOR";

  return (
    <span className="d-flex align-items-center gap-2">
      {error && <span className="small text-danger">{error}</span>}
      {viewerIsOwner && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isPending}
          onClick={() =>
            run(() => setCommunityMemberRole(communityId, userId, role !== "MODERATOR"))
          }
        >
          {role === "MODERATOR" ? s.removeModerator : s.makeModerator}
        </button>
      )}
      {canBan && (
        <ConfirmForm
          action={async () => {
            // Ошибку показывает сама ConfirmForm — она умеет { error }.
            const result = await banCommunityMember(communityId, userId);
            if (!result.ok) return result;
            router.refresh();
          }}
          confirmMessage={s.banConfirm(name)}
          confirmLabel={s.ban}
        >
          <button type="button" className="btn btn-ghost btn-sm text-danger">
            {s.ban}
          </button>
        </ConfirmForm>
      )}
    </span>
  );
}
