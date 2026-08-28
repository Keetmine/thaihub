import "dotenv/config";
import { access } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { privateUploadsDir } from "../src/lib/privateUploads";

/**
 * Вернуть владельцу билет-сироту: файл в private-uploads/tickets ЕСТЬ,
 * а записи о нём в базе НЕТ — и /files/tickets/… отвечает «не найдено».
 *
 * Так погибали билеты до таблицы EventTicket: файл висел на отметке
 * «иду» (EventAttendance.ticketUrl), и снятие отметки или пересборка
 * дат события админкой убивали строку вместе с ссылкой на файл. Кто
 * загрузил файл, по самому файлу не восстановить (имя случайное),
 * поэтому владельца и событие называем руками:
 *
 *   docker compose exec app npx tsx scripts/adopt-orphan-ticket.ts \
 *     --file fba6d4eb-….pdf --user keetmine --event <слаг события> \
 *     [--date 2026-09-12]   # привязать к конкретной дате события
 *
 * Без --date билет вешается на событие целиком (дата в кабинете не
 * показывается, на странице события он не виден — только в «Мои
 * билеты»). С --date заполняется occurrenceId, и билет встаёт в свою
 * строку на странице события и в план поездки.
 */

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const fileArg = arg("file");
  const userArg = arg("user");
  const eventArg = arg("event");
  const dateArg = arg("date");
  if (!fileArg || !userArg || !eventArg) {
    console.log("Нужны --file <имя.pdf> --user <ник> --event <слаг|id> [--date ГГГГ-ММ-ДД]");
    process.exit(1);
  }

  const name = path.basename(fileArg); // принимаем и полный URL, и имя
  const fileUrl = `/files/tickets/${name}`;
  await access(privateUploadsDir("tickets", name)).catch(() => {
    console.error(`Файла нет на диске: private-uploads/tickets/${name}`);
    process.exit(1);
  });

  const user = await prisma.user.findUnique({ where: { username: userArg } });
  if (!user) throw new Error(`Пользователь «${userArg}» не найден`);

  const event = await prisma.event.findFirst({
    where: { OR: [{ slug: eventArg }, { id: eventArg }] },
    include: { occurrences: { orderBy: { startsAt: "asc" } } },
  });
  if (!event) throw new Error(`Событие «${eventArg}» не найдено`);

  let occurrenceId: string | null = null;
  if (dateArg) {
    const hit = event.occurrences.find(
      (o) => o.startsAt.toISOString().slice(0, 10) === dateArg,
    );
    if (!hit) {
      const dates = event.occurrences.map((o) => o.startsAt.toISOString().slice(0, 10));
      throw new Error(`У события нет даты ${dateArg}. Есть: ${dates.join(", ") || "—"}`);
    }
    occurrenceId = hit.id;
  }

  const existing = await prisma.eventTicket.findFirst({ where: { fileUrl } });
  if (existing) {
    console.log(`Файл уже привязан (EventTicket ${existing.id}) — ничего не делаю.`);
    return;
  }

  const ticket = await prisma.eventTicket.create({
    data: { userId: user.id, eventId: event.id, occurrenceId, fileUrl },
  });
  console.log(
    `Готово: билет ${ticket.id} → @${user.username}, «${event.title}»` +
      (occurrenceId ? `, дата ${dateArg}` : " (без даты)") +
      `\nПроверка: ${fileUrl}`,
  );
}

main()
  .catch((e) => {
    console.error("FATAL", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
