import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const ADMIN_COOKIE = "admin_session";
const ADMIN_SESSION_DAYS = 30;

// Серверные админ-сессии (строка в AdminSession, кука хранит её id) —
// раньше кука хранила сам ADMIN_SESSION_SECRET: такую сессию нельзя было
// отозвать, а утёкшая кука работала вечно, пока не сменишь секрет.
// Отдельных админ-аккаунтов по-прежнему нет — сессию создаёт единый
// пароль. proxy.ts проверяет только НАЛИЧИЕ куки (optimistic, без БД);
// реальная валидация — здесь.

export async function createAdminSession(): Promise<void> {
  const session = await prisma.adminSession.create({
    data: { expiresAt: new Date(Date.now() + ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000) },
  });
  const store = await cookies();
  store.set(ADMIN_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  const id = store.get(ADMIN_COOKIE)?.value;
  if (id) {
    await prisma.adminSession.delete({ where: { id } }).catch(() => {});
  }
  store.delete(ADMIN_COOKIE);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const id = store.get(ADMIN_COOKIE)?.value;
  if (!id) return false;

  const session = await prisma.adminSession.findUnique({ where: { id } });
  return !!session && session.expiresAt > new Date();
}

/** Гейт для admin server actions и страниц: proxy.ts проверяет только
 *  НАЛИЧИЕ куки, так что без этого вызова поддельная кука добралась бы
 *  до мутаций. Бросает при невалидной/просроченной сессии. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) {
    throw new Error("Требуется вход в админку");
  }
}
