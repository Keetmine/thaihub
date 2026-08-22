import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export const USER_COOKIE = "user_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export async function createUserSession(userId: string) {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.userSession.create({ data: { id, userId, expiresAt } });

  const store = await cookies();
  store.set(USER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function destroyUserSession() {
  const store = await cookies();
  const id = store.get(USER_COOKIE)?.value;
  if (id) {
    await prisma.userSession.delete({ where: { id } }).catch(() => {});
  }
  store.delete(USER_COOKIE);
}

// React.cache: один запрос сессии на HTTP-запрос, сколько бы раз
// layout и страница ни спросили текущего пользователя.
export const getCurrentUser = cache(async () => {
  const store = await cookies();
  const id = store.get(USER_COOKIE)?.value;
  if (!id) return null;

  const session = await prisma.userSession.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) return null;
  // Удалённый аккаунт не должен «оживать» по старой сессии.
  if (session.user.deletedAt) return null;
  return session.user;
});
