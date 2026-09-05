import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Out-of-process по той же причине, что cleanup-test-user.ts (Prisma
// ESM-only, из spec-файла её не импортировать).
//
// Готовит поездку с бронью жилья для trip-booking-privacy.spec.ts. Через
// интерфейс это форма создания поездки плюс форма брони — обе за
// подпиской и обе многошаговые; проверяем мы не их, а утечку в разметке,
// поэтому данные кладём напрямую.
//
// Печатает id созданной поездки единственной строкой stdout — спека
// читает его оттуда и им же потом удаляет поездку.

type Input = {
  ownerEmail: string;
  title: string;
  visibility: "PRIVATE" | "FRIENDS" | "PUBLIC";
  hotelName: string;
  address: string;
  note: string;
};

const DAY = 86_400_000;

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error("usage: tsx create-test-trip-booking.ts '<json>'");
  const input = JSON.parse(raw) as Input;

  const owner = await prisma.user.findUnique({
    where: { email: input.ownerEmail },
    select: { id: true },
  });
  if (!owner) throw new Error(`нет пользователя ${input.ownerEmail}`);

  // Даты «настенные» и считаются в UTC (см. src/lib/dates.ts) — иначе
  // подписи дня разъедутся относительно того, что рисует страница.
  // Ставим поездку далеко в будущее: чем меньше чужих событий афиши
  // попадёт в эти даты, тем чище лента.
  const start = new Date(new Date().setUTCHours(0, 0, 0, 0) + 400 * DAY);
  const end = new Date(start.getTime() + 5 * DAY);

  const trip = await prisma.trip.create({
    data: {
      userId: owner.id,
      title: input.title,
      startDate: start,
      endDate: end,
      visibility: input.visibility,
      // Слаг не генерируем — спека ходит по id, tripHref сам откатится
      // на него.
      bookings: {
        create: {
          kind: "HOTEL",
          name: input.hotelName,
          address: input.address,
          note: input.note,
          // Обе даты — чтобы бронь стала «стоянкой» и лента нарисовала
          // подложку-полосу (классы in-stay / stay-open / stay-close).
          startAt: new Date(start.getTime() + 14 * 3600_000),
          endAt: new Date(start.getTime() + 3 * DAY + 12 * 3600_000),
        },
      },
      // Запись МЕЖДУ заездом и выездом: без неё лента схлопнула бы обе
      // стороны брони в одну строку (см. docs/features/trips.md), и
      // маркеров stay-open / stay-close в разметке не было бы вовсе.
      personalEvents: {
        create: {
          title: "Dinner",
          startsAt: new Date(start.getTime() + DAY + 19 * 3600_000),
          createdById: owner.id,
        },
      },
    },
    select: { id: true },
  });

  console.log(trip.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
