"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { SETTING_KEYS } from "@/lib/siteSettings";

/** Сохраняет известные ключи настроек (см. SETTING_KEYS); пустое
 *  значение удаляет ключ — потребитель вернётся к дефолту из env/кода. */
export async function saveSettings(formData: FormData): Promise<void> {
  await requireAdmin();
  for (const { key } of SETTING_KEYS) {
    const value = String(formData.get(key) ?? "").trim();
    if (value) {
      await prisma.siteSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    } else {
      await prisma.siteSetting.deleteMany({ where: { key } });
    }
  }
  revalidatePath("/admin/settings");
  revalidatePath("/");
}
