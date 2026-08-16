import { getCurrentUser } from "@/lib/userAuth";

// Админ-доступ — это роль пользователя (User.isAdmin), а не отдельный
// логин: раньше был общий ADMIN_PASSWORD + серверные AdminSession,
// теперь используется обычная пользовательская сессия. proxy.ts
// проверяет только НАЛИЧИЕ user-куки (optimistic, без БД); реальная
// проверка роли — здесь.

export async function isAdminAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user?.isAdmin;
}

/** Гейт для admin server actions и страниц: proxy.ts проверяет только
 *  наличие куки, так что без этого вызова любой залогиненный (или
 *  поддельная кука) добрался бы до мутаций. Бросает, если текущий
 *  пользователь не админ. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) {
    throw new Error("Требуется доступ администратора");
  }
}
