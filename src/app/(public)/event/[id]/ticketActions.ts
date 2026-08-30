"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { privateUploadsDir } from "@/lib/privateUploads";
import { canAttachPrivateFile } from "@/lib/privateFiles";
import { getT } from "@/lib/i18n";

/** Ошибки — значением, а не броском: в проде Next минифицирует текст
 *  исключения из server action (см. promoActions.ts). */
export type TicketActionResult = { ok: true } | { ok: false; error: string };

/** Удаляем файл билета с диска — оба поколения путей. */
async function unlinkTicketFile(fileUrl: string): Promise<void> {
  if (fileUrl.startsWith("/files/tickets/")) {
    await unlink(privateUploadsDir("tickets", path.basename(fileUrl))).catch(() => {});
  } else if (fileUrl.startsWith("/uploads/tickets/")) {
    // Билеты, загруженные до переезда в приватное хранилище
    // (scripts/migrate-private-uploads.ts переносит и их).
    await unlink(path.join(process.cwd(), "public", fileUrl)).catch(() => {});
  }
}

/** Прикрепить/сменить билет к дате события. url — из /api/upload-ticket
 *  (принимаем только собственный каталог билетов).
 *
 *  Билет — своя запись (EventTicket), а не поле на отметке «иду»: на
 *  отметке он погибал вместе с ней при снятии «иду» или пересборке дат
 *  события. «Иду» для прикрепления по-прежнему требуется — это порядок
 *  интерфейса, а не место хранения. */
export async function setAttendanceTicket(
  occurrenceId: string,
  url: string,
): Promise<TicketActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  // Строгий формат /files/tickets/<uuid>.<ext> + файл не занят чужой
  // записью: раньше проверялся только префикс, и путь ЧУЖОГО билета
  // можно было привязать себе (а потом открепить — и удалить файл у
  // настоящего владельца). См. lib/privateFiles.ts.
  if (!(await canAttachPrivateFile(url, "tickets", user.id))) {
    return { ok: false, error: t.events.tickets.badFile };
  }
  const attendance = await prisma.eventAttendance.findUnique({
    where: { userId_occurrenceId: { userId: user.id, occurrenceId } },
    select: { eventId: true },
  });
  if (!attendance) return { ok: false, error: t.events.tickets.goFirst };

  const existing = await prisma.eventTicket.findFirst({
    where: { userId: user.id, occurrenceId },
  });
  if (existing) {
    // Смена файла: старый с диска убираем, иначе копился бы мусор.
    if (existing.fileUrl !== url) await unlinkTicketFile(existing.fileUrl);
    await prisma.eventTicket.update({ where: { id: existing.id }, data: { fileUrl: url } });
  } else {
    await prisma.eventTicket.create({
      data: { userId: user.id, eventId: attendance.eventId, occurrenceId, fileUrl: url },
    });
  }
  revalidatePath("/event");
  return { ok: true };
}

/** Открепить билет (файл тоже удаляем — он больше нигде не используется). */
export async function removeAttendanceTicket(occurrenceId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ticket = await prisma.eventTicket.findFirst({
    where: { userId: user.id, occurrenceId },
  });
  if (!ticket) return;
  await prisma.eventTicket.delete({ where: { id: ticket.id } });
  await unlinkTicketFile(ticket.fileUrl);
}
