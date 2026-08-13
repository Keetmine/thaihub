import { cookies } from "next/headers";

export const ADMIN_COOKIE = "admin_session";

export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;
  return !!value && !!process.env.ADMIN_SESSION_SECRET && value === process.env.ADMIN_SESSION_SECRET;
}
