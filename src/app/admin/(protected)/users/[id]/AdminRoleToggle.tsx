"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAdminRole } from "../actions";

// Кнопка назначения/снятия роли админа. Себя разжаловать нельзя
// (сервер тоже это проверяет) — кнопка просто дизейблится.
export default function AdminRoleToggle({
  userId,
  isAdmin,
  isSelf,
}: {
  userId: string;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await setAdminRole(userId, !isAdmin);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить роль");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="d-inline-flex flex-column">
      <button
        type="button"
        className={`btn btn-sm ${isAdmin ? "btn-outline-danger" : "btn-ghost"}`}
        onClick={toggle}
        disabled={pending || (isAdmin && isSelf)}
        title={isAdmin && isSelf ? "Нельзя снять роль с самого себя" : undefined}
      >
        {pending ? "…" : isAdmin ? "Снять админа" : "Сделать админом"}
      </button>
      {error && <span className="small text-danger mt-1">{error}</span>}
    </div>
  );
}
