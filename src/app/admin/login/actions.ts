"use server";

import { redirect } from "next/navigation";
import { createAdminSession, destroyAdminSession } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rateLimit";

export async function login(formData: FormData) {
  await assertRateLimit("login");
  const password = String(formData.get("password") ?? "");

  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    redirect("/admin/login?error=1");
  }

  await createAdminSession();
  redirect("/admin");
}

export async function logout() {
  await destroyAdminSession();
  redirect("/");
}
