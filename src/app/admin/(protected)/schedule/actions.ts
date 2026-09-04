"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { jobDefinition, runDueJobs } from "@/lib/scheduledJobs";

/** Сохранить расписание одной задачи: включена ли, в котором часу и по
 *  кому работает. */
export async function saveJobSchedule(key: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!jobDefinition(key)) throw new Error("Неизвестная задача");

  const enabled = formData.get("enabled") === "on";
  const hourRaw = Number(formData.get("hour"));
  const hourOk = Number.isInteger(hourRaw) && hourRaw >= 0 && hourRaw <= 23;
  const targetMode = formData.get("targetMode") === "SELECTED" ? "SELECTED" : "ALL";

  // Кривой/пропавший час НЕ подменяем дефолтной четвёркой молча: у
  // владельца на проде такой фолбэк однажды «съел» выбранное время, и
  // сохранение выглядело сломанным. Не распарсили — оставляем прежнее.
  const existing = await prisma.scheduledJob.findUnique({ where: { key } });
  const hour = hourOk ? hourRaw : (existing?.hour ?? 4);

  await prisma.scheduledJob.upsert({
    where: { key },
    create: { key, enabled, hour, targetMode },
    update: { enabled, hour, targetMode },
  });

  revalidatePath("/admin/schedule");
}

/** Добавить артиста в список проверки. */
export async function addJobTarget(key: string, performerId: string): Promise<void> {
  await requireAdmin();
  if (!performerId) return;
  // Задача может ещё не иметь строки в БД — создаём вместе с целью.
  await prisma.scheduledJob.upsert({
    where: { key },
    create: { key, targetMode: "SELECTED" },
    update: {},
  });
  await prisma.scheduledJobTarget.upsert({
    where: { jobKey_performerId: { jobKey: key, performerId } },
    create: { jobKey: key, performerId },
    update: {},
  });
  revalidatePath("/admin/schedule");
}

export async function removeJobTarget(key: string, performerId: string): Promise<void> {
  await requireAdmin();
  await prisma.scheduledJobTarget.deleteMany({ where: { jobKey: key, performerId } });
  revalidatePath("/admin/schedule");
}

/**
 * Запустить задачу сейчас, не дожидаясь расписания. Полезно и для
 * проверки настроек, и когда новинки нужны прямо сейчас.
 */
export async function runJobNow(key: string): Promise<void> {
  await requireAdmin();
  const def = jobDefinition(key);
  if (!def) throw new Error("Неизвестная задача");

  const job = await prisma.scheduledJob.findUnique({
    where: { key },
    include: { targets: { select: { performerId: true } } },
  });
  const targetIds =
    def.supportsTargets && job?.targetMode === "SELECTED"
      ? job.targets.map((t) => t.performerId)
      : null;

  await prisma.scheduledJob.upsert({
    where: { key },
    create: { key, lastRunAt: new Date(), lastStatus: "RUNNING" },
    update: { lastRunAt: new Date(), lastStatus: "RUNNING" },
  });

  try {
    const summary = await def.run(targetIds);
    await prisma.scheduledJob.update({
      where: { key },
      data: { lastStatus: "DONE", lastSummary: summary },
    });
  } catch (err) {
    await prisma.scheduledJob.update({
      where: { key },
      data: {
        lastStatus: "FAILED",
        lastSummary: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }

  revalidatePath("/admin/schedule");
}

/** Ручной тик планировщика — на случай, если нужно проверить, что
 *  «пора» считается верно. */
export async function tickScheduler(): Promise<void> {
  await requireAdmin();
  await runDueJobs();
  revalidatePath("/admin/schedule");
}
