/**
 * Переезд приватных файлов из public/uploads в приватное хранилище
 * (private-uploads/, см. src/lib/privateUploads.ts):
 *
 *  - билеты: public/uploads/tickets/x → private-uploads/tickets/x,
 *    EventAttendance.ticketUrl «/uploads/tickets/x» → «/files/tickets/x»;
 *  - брони отелей: файлы TripHotel.fileUrl лежали в корне
 *    public/uploads → private-uploads/hotels/x, url → «/files/hotels/x».
 *
 * Идемпотентен: уже перенесённые строки (/files/…) пропускаются; если
 * файла на диске нет — url всё равно обновляется (файл потерян, но
 * ссылка перестаёт светить в публичную статику).
 *
 * Запуск: npx tsx scripts/migrate-private-uploads.ts
 * На проде — после деплоя версии с /files/… (см. docs/deploy.md).
 */
import { mkdir, rename } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { privateUploadsDir } from "../src/lib/privateUploads";

async function moveFile(from: string, to: string): Promise<boolean> {
  try {
    await rename(from, to);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(privateUploadsDir("tickets"), { recursive: true });
  await mkdir(privateUploadsDir("hotels"), { recursive: true });
  const publicDir = path.join(process.cwd(), "public");

  const tickets = await prisma.eventAttendance.findMany({
    where: { ticketUrl: { startsWith: "/uploads/tickets/" } },
    select: { userId: true, occurrenceId: true, ticketUrl: true },
  });
  let movedTickets = 0;
  for (const t of tickets) {
    const name = path.basename(t.ticketUrl!);
    const moved = await moveFile(
      path.join(publicDir, "uploads", "tickets", name),
      privateUploadsDir("tickets", name),
    );
    if (!moved) console.warn(`ticket file missing on disk: ${t.ticketUrl}`);
    await prisma.eventAttendance.update({
      where: { userId_occurrenceId: { userId: t.userId, occurrenceId: t.occurrenceId } },
      data: { ticketUrl: `/files/tickets/${name}` },
    });
    movedTickets += 1;
  }

  const hotels = await prisma.tripBooking.findMany({
    where: { fileUrl: { startsWith: "/uploads/" } },
    select: { id: true, fileUrl: true },
  });
  let movedHotels = 0;
  for (const h of hotels) {
    const name = path.basename(h.fileUrl!);
    const moved = await moveFile(
      path.join(publicDir, h.fileUrl!),
      privateUploadsDir("hotels", name),
    );
    if (!moved) console.warn(`hotel file missing on disk: ${h.fileUrl}`);
    await prisma.tripBooking.update({
      where: { id: h.id },
      data: { fileUrl: `/files/hotels/${name}` },
    });
    movedHotels += 1;
  }

  console.log(`done: tickets ${movedTickets}, hotels ${movedHotels}`);
}

main().then(() => process.exit(0));
