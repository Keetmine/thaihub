import { redirect } from "next/navigation";
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

/** Менеджер каталога или админ: правит события/исполнителей/сериалы/
 *  новеллы/локации и запускает импорты, но не трогает пользователей,
 *  финансы, рассылки и настройки — там остаётся requireAdmin(). */
export async function isCatalogEditor(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user && (user.isAdmin || user.isManager);
}

/** Гейт СТРАНИЦ, доступных только админу (пользователи, финансы,
 *  рассылки, настройки, модерация…): менеджера каталога уводим на
 *  дашборд, а не на 403 — он законно внутри админки, просто не сюда. */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }
}

export async function requireCatalogEditor(): Promise<void> {
  if (!(await isCatalogEditor())) {
    throw new Error("Требуется доступ администратора или менеджера каталога");
  }
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
