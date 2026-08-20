"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { isValidUsername, RESERVED_USERNAMES } from "@/lib/userProfile";
import { isKnownCountry } from "@/lib/countries";

export type ProfileSetupResult = { ok: true } | { ok: false; error: string };

/**
 * Первый шаг после регистрации: ник (обязателен, уникален — по нему
 * строится ссылка /users/keetmine) и необязательные поля профиля.
 *
 * Ошибки возвращаются значением: текст исключения из server action
 * в проде до клиента не доходит (см. docs/architecture.md).
 */
export async function saveProfileSetup(formData: FormData): Promise<ProfileSetupResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  if (!username) return { ok: false, error: "Придумайте ник" };
  if (!isValidUsername(username)) {
    return {
      ok: false,
      error: "Ник: 2–24 символа, латиница, цифры, точка, дефис или подчёркивание",
    };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, error: "Этот ник занят системой, выберите другой" };
  }

  const taken = await prisma.user.findFirst({
    where: { username, id: { not: user.id } },
    select: { id: true },
  });
  if (taken) return { ok: false, error: "Такой ник уже занят" };

  const name = String(formData.get("name") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const birthRaw = String(formData.get("birthDate") ?? "").trim();
  // Дата — в UTC-слот, как остальные даты проекта (см. lib/dates.ts).
  const [by, bm, bd] = birthRaw.split("-").map(Number);
  const birthDate = by && bm && bd ? new Date(Date.UTC(by, bm - 1, bd)) : null;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      username,
      name: name || user.name,
      country: country && isKnownCountry(country) ? country : null,
      gender: gender || null,
      bio: bio || null,
      birthDate,
    },
  });

  revalidatePath("/account");
  return { ok: true };
}
