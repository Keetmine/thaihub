import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * Разовый аудит «усыновлённых» приватных файлов.
 *
 * Предыстория. Пути приватных файлов (/files/tickets/…, /files/hotels/…,
 * /files/personal/…) приходят из формы обычной строкой, и сервер долго
 * верил им как есть. Значит, чужой путь — например, подсмотренный в
 * общей поездке — можно было вписать в СВОЮ запись и получить к файлу
 * доступ через раздачу /files/… (она проверяет права по записи), а при
 * удалении своей записи — стереть файл у настоящего владельца.
 * Дыру закрыл гейт canAttachPrivateFile (src/lib/privateFiles.ts), но он
 * защищает только НОВЫЕ записи: то, что уже усыновлено, лежит в базе.
 *
 * Скрипт ищет ровно эти следы: один и тот же путь, встречающийся у
 * записей РАЗНЫХ владельцев. Он ТОЛЬКО ОТЧИТЫВАЕТСЯ — ничего не удаляет
 * и не правит; что делать с находкой (снять путь, вернуть файл, спросить
 * людей), решается руками.
 *
 * Запуск:
 *   npx tsx --env-file=.env scripts/audit-adopted-files.ts
 *
 * Кто владелец — берём ту же логику, что и в isPrivateFileFree:
 *  - EventTicket.fileUrl — владелец один: EventTicket.userId;
 *  - TripBooking.fileUrl и TripPersonalEvent.imageUrl — владельцев
 *    несколько: хозяин поездки и её ПРИНЯТЫЕ участники (для них файл
 *    «свой», перепривязка внутри поездки безвредна).
 *
 * Отсюда критерий подозрения: у всех записей с одним путём НЕТ ни одного
 * общего человека, то есть пересечение множеств владельцев пусто. Если
 * общий человек есть (свой файл переложили в другую свою запись, файл
 * гуляет внутри одной поездки) — это не усыновление, такие совпадения
 * считаем отдельной строкой и не поднимаем тревогу.
 *
 * Ошибка БД — стоп с внятным сообщением: пустой отчёт по недоступной
 * базе легко прочитать как «всё чисто».
 */

type FileRecord = {
  /** Человекочитаемое «что это за запись»: модель + id. */
  label: string;
  /** Кому файл законно принадлежит (для поездок — владелец + принятые). */
  owners: string[];
  /** Пояснение к владельцам: имя поездки/события — чтобы отчёт читался. */
  context: string;
};

async function collect(): Promise<Map<string, FileRecord[]>> {
  // Принятые участники поездки — такие же законные владельцы файла, как
  // и её хозяин (см. foreignTrip в privateFiles.ts).
  const tripOwners = {
    select: {
      id: true,
      title: true,
      userId: true,
      members: { where: { status: "ACCEPTED" as const }, select: { userId: true } },
    },
  } as const;

  const [tickets, bookings, personal] = await Promise.all([
    prisma.eventTicket.findMany({
      select: { id: true, fileUrl: true, userId: true, event: { select: { title: true } } },
    }),
    prisma.tripBooking.findMany({
      where: { fileUrl: { not: null } },
      select: { id: true, fileUrl: true, name: true, trip: tripOwners },
    }),
    prisma.tripPersonalEvent.findMany({
      where: { imageUrl: { not: null } },
      select: { id: true, imageUrl: true, title: true, trip: tripOwners },
    }),
  ]);

  const byUrl = new Map<string, FileRecord[]>();
  const push = (url: string, rec: FileRecord) => {
    byUrl.set(url, [...(byUrl.get(url) ?? []), rec]);
  };

  for (const t of tickets) {
    if (!t.fileUrl) continue;
    push(t.fileUrl, {
      label: `EventTicket ${t.id}`,
      owners: [t.userId],
      context: `билет на «${t.event.title}»`,
    });
  }
  for (const b of bookings) {
    push(b.fileUrl!, {
      label: `TripBooking ${b.id}`,
      owners: [b.trip.userId, ...b.trip.members.map((m) => m.userId)],
      context: `бронь «${b.name}» в поездке «${b.trip.title}»`,
    });
  }
  for (const p of personal) {
    push(p.imageUrl!, {
      label: `TripPersonalEvent ${p.id}`,
      owners: [p.trip.userId, ...p.trip.members.map((m) => m.userId)],
      context: `личное событие «${p.title}» в поездке «${p.trip.title}»`,
    });
  }
  return byUrl;
}

/** Есть ли человек, которому законно принадлежат ВСЕ эти записи. */
function hasCommonOwner(records: FileRecord[]): boolean {
  let common = new Set(records[0].owners);
  for (const rec of records.slice(1)) {
    const owners = new Set(rec.owners);
    common = new Set([...common].filter((id) => owners.has(id)));
    if (common.size === 0) return false;
  }
  return common.size > 0;
}

async function main() {
  let byUrl: Map<string, FileRecord[]>;
  try {
    byUrl = await collect();
  } catch (err) {
    console.error(
      "Ошибка чтения БД — отчёт не строим. Пустой отчёт по недоступной базе\n" +
        "легко принять за «всё чисто», поэтому останавливаемся:",
      err,
    );
    process.exitCode = 1;
    return;
  }

  const shared = [...byUrl.entries()].filter(([, records]) => records.length > 1);
  const suspicious = shared.filter(([, records]) => !hasCommonOwner(records));
  const benign = shared.length - suspicious.length;

  console.log(
    `Путей с приватными файлами: ${byUrl.size}; ` +
      `используются больше чем одной записью: ${shared.length}.`,
  );

  if (suspicious.length === 0) {
    console.log("\nПересечений между РАЗНЫМИ владельцами не найдено — следов усыновления нет.");
  } else {
    console.log(`\nПодозрительных путей (записи разных владельцев): ${suspicious.length}\n`);

    // Имена владельцев подтягиваем разом, чтобы отчёт не был колонкой cuid.
    const userIds = [
      ...new Set(suspicious.flatMap(([, records]) => records.flatMap((r) => r.owners))),
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, username: true, email: true },
    });
    const who = new Map(
      users.map((u) => [u.id, `${u.name || u.username || u.email || "?"} (${u.id})`]),
    );

    for (const [url, records] of suspicious) {
      console.log(`  ${url}`);
      for (const rec of records) {
        const owners = rec.owners.map((id) => who.get(id) ?? id).join(", ");
        console.log(`    ${rec.label} — ${rec.context}`);
        console.log(`      владельцы: ${owners}`);
      }
      console.log("");
    }
    console.log(
      "Скрипт ничего не изменил. Разбирать руками: у кого файл появился раньше —\n" +
        "тот, скорее всего, настоящий владелец; у остальных путь стоит снять.",
    );
  }

  if (benign > 0) {
    console.log(
      `\nЕщё ${benign} путей делятся между записями с общим владельцем ` +
        "(свой файл в двух своих записях или файл внутри одной поездки) — это норма.",
    );
  }
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
