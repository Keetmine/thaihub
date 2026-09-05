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
import { combineDateTime } from "@/lib/dates";

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

/** Ссылка на онлайн-бронирование — только http(s): значение уходит в
 *  href кнопки и в текст Telegram-сообщения, javascript: там не место. */
function normalizeBookingUrl(raw: string): string | null | undefined {
  const url = raw.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/** Записать у своего билета онлайн-бронирование: когда открывается
 *  (дата «YYYY-MM-DD» + время «HH:mm», тайское настенное — хранится как
 *  Event.presaleAt, через combineDateTime) и ссылку. Дата и время идут
 *  вместе; без них можно оставить одну ссылку. Смена времени сбрасывает
 *  отметку «напомнили» — новое время напоминается заново. */
export async function setTicketOnlineBooking(
  occurrenceId: string,
  input: { date: string; time: string; url: string },
): Promise<TicketActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const date = input.date.trim();
  const time = input.time.trim();
  if ((date && !time) || (!date && time)) {
    return { ok: false, error: t.events.tickets.onlineBooking.needDateTime };
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: t.events.tickets.onlineBooking.needDateTime };
  }
  if (time && !/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, error: t.events.tickets.onlineBooking.needDateTime };
  }
  const url = normalizeBookingUrl(input.url);
  if (url === undefined) return { ok: false, error: t.events.tickets.onlineBooking.badUrl };
  if (!date && !url) return { ok: false, error: t.events.tickets.onlineBooking.needDateTime };

  const ticket = await prisma.eventTicket.findFirst({
    where: { userId: user.id, occurrenceId },
    select: { id: true, onlineBookingAt: true },
  });
  if (!ticket) return { ok: false, error: t.events.tickets.goFirst };

  const onlineBookingAt = date ? combineDateTime(date, time) : null;
  const timeChanged = (ticket.onlineBookingAt?.getTime() ?? null) !== (onlineBookingAt?.getTime() ?? null);
  await prisma.eventTicket.update({
    where: { id: ticket.id },
    data: {
      onlineBookingAt,
      onlineBookingUrl: url,
      ...(timeChanged ? { onlineBookingNotifiedAt: null } : {}),
    },
  });
  revalidatePath("/event");
  return { ok: true };
}

/** Убрать онлайн-бронирование у своего билета (сам билет остаётся). */
export async function removeTicketOnlineBooking(occurrenceId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.eventTicket.updateMany({
    where: { userId: user.id, occurrenceId },
    data: { onlineBookingAt: null, onlineBookingUrl: null, onlineBookingNotifiedAt: null },
  });
  revalidatePath("/event");
}
