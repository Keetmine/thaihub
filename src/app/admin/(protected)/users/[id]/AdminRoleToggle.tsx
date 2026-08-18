"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAdminRole, setManagerRole } from "../actions";

// Кнопка назначения/снятия роли админа. Себя разжаловать нельзя
// (сервер тоже это проверяет) — кнопка просто дизейблится.
export default function AdminRoleToggle({
  userId,
  isAdmin,
  isManager = false,
  isSelf,
}: {
  userId: string;
  isAdmin: boolean;
  /** Менеджер каталога: правит каталог, служебные разделы не видит. */
  isManager?: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"admin" | "manager" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "admin" | "manager") {
    setPending(kind);
    setError(null);
    try {
      if (kind === "admin") await setAdminRole(userId, !isAdmin);
      else await setManagerRole(userId, !isManager);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить роль");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="d-inline-flex flex-column gap-2">
      <div className="d-flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn btn-sm ${isAdmin ? "btn-outline-danger" : "btn-ghost"}`}
          onClick={() => run("admin")}
          disabled={pending !== null || (isAdmin && isSelf)}
          title={isAdmin && isSelf ? "Нельзя снять роль с самого себя" : undefined}
        >
          {pending === "admin" ? "…" : isAdmin ? "Снять админа" : "Сделать админом"}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${isManager ? "btn-outline-danger" : "btn-ghost"}`}
          onClick={() => run("manager")}
          disabled={pending !== null || isAdmin}
          title={isAdmin ? "У админа и так полный доступ" : "Правит каталог: события, исполнителей, сериалы, новеллы, локации"}
        >
          {pending === "manager" ? "…" : isManager ? "Снять менеджера" : "Сделать менеджером"}
        </button>
      </div>
      {error && <span className="small text-danger">{error}</span>}
    </div>
  );
}
