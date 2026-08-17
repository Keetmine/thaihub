"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";

/** Прикрепить/сменить билет к своему «иду» на конкретную дату. url —
 *  из /api/upload-ticket (принимаем только собственный каталог билетов). */
export async function setAttendanceTicket(occurrenceId: string, url: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!url.startsWith("/uploads/tickets/")) throw new Error("Некорректный файл билета");
  const updated = await prisma.eventAttendance.updateMany({
    where: { userId: user.id, occurrenceId },
    data: { ticketUrl: url },
  });
  if (updated.count === 0) throw new Error("Сначала отметьте «иду» на эту дату");
  revalidatePath("/event");
}

/** Открепить билет (файл тоже удаляем — он больше нигде не используется). */
export async function removeAttendanceTicket(occurrenceId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const attendance = await prisma.eventAttendance.findUnique({
    where: { userId_occurrenceId: { userId: user.id, occurrenceId } },
  });
  if (!attendance?.ticketUrl) return;
  await prisma.eventAttendance.update({
    where: { userId_occurrenceId: { userId: user.id, occurrenceId } },
    data: { ticketUrl: null },
  });
  if (attendance.ticketUrl.startsWith("/uploads/tickets/")) {
    await unlink(path.join(process.cwd(), "public", attendance.ticketUrl)).catch(() => {});
  }
}
