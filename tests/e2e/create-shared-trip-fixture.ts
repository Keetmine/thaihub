import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Out-of-process по той же причине, что create-test-trip-booking.ts
// (Prisma ESM-only, из spec-файла её не импортировать).
//
// Готовит СОВМЕСТНУЮ поездку для trip-shared-matrix.spec.ts: владелец,
// участница со своим окном присутствия (АА17) и посторонний, у каждого
// своя сессия — спека ходит по ним куками, минуя форму входа (у неё
// лимит 30 попыток за 10 минут, см. auth.setup.ts).
//
// Данные кладём напрямую, а не через интерфейс: проверяем мы не формы
// создания, а КТО ЧТО ВИДИТ — приватность записей, окна присутствия и
// пейволл. Печатает JSON единственной строкой; им же спека всё удаляет.

const PREFIX = "e2e-shared-trip";
// Свой суффикс на прогон: одинаковый слаг, пересозданный после удаления,
// в деве отдаёт закэшированную «страницу не найдена».
const TAG = `${PREFIX}-${Date.now().toString(36)}`;

async function main() {
  await cleanup();

  const mkUser = (suffix: string, name: string, premium: boolean) =>
    prisma.user.create({
      data: {
        email: `${TAG}-${suffix}@test.local`,
        name,
        premiumUntil: premium ? new Date(Date.now() + 365 * 86_400_000) : null,
      },
      select: { id: true },
    });
  const owner = await mkUser("owner", `${TAG} хозяйка`, true);
  const member = await mkUser("member", `${TAG} подруга`, true);
  const stranger = await mkUser("stranger", `${TAG} посторонняя`, false);

  // Событие в общие дни и событие ПОСЛЕ отъезда владельца — второе
  // проверяет, что рамка поездки накрывает окна всех участников.
  const mkEvent = (title: string, day: string) =>
    prisma.event.create({
      data: {
        title: `${TAG} ${title}`,
        venue: "Impact Arena",
        occurrences: { create: [{ startsAt: new Date(`${day}T12:00:00.000Z`), hasTime: true }] },
      },
      select: { id: true, occurrences: { select: { id: true } } },
    });
  const common = await mkEvent("общий концерт", "2031-10-25");
  const late = await mkEvent("поздний фанмит", "2031-11-04");

  const trip = await prisma.trip.create({
    data: {
      userId: owner.id,
      title: `${TAG} поездка`,
      slug: TAG,
      startDate: new Date("2031-10-18T00:00:00.000Z"),
      endDate: new Date("2031-11-02T00:00:00.000Z"),
      visibility: "PUBLIC",
      members: { create: [{ userId: member.id, status: "ACCEPTED" }] },
      stays: {
        create: [
          // У подруги окно ШИРЕ поездки: её последний день обязан
          // попасть в ленту вместе с событием того дня.
          { userId: member.id, startDate: new Date("2031-10-22T00:00:00.000Z"), endDate: new Date("2031-11-06T00:00:00.000Z") },
        ],
      },
      personalEvents: {
        create: [
          { title: `${TAG} ужин участникам`, startsAt: new Date("2031-10-26T12:00:00.000Z"), createdById: owner.id, visibility: "PARTICIPANTS" },
          { title: `${TAG} массаж только мой`, startsAt: new Date("2031-10-27T12:00:00.000Z"), createdById: owner.id, visibility: "PRIVATE" },
        ],
      },
      todos: {
        create: [
          { text: `${TAG} дело участникам`, kind: "TODO", date: new Date("2031-10-24T00:00:00.000Z"), createdById: owner.id, visibility: "PARTICIPANTS" },
          { text: `${TAG} вещь подруги`, kind: "PACKING", createdById: member.id, visibility: "PRIVATE" },
          { text: `${TAG} покупка общая`, kind: "SHOPPING", createdById: owner.id, visibility: "PARTICIPANTS" },
        ],
      },
      bookings: {
        create: [
          // Приватная бронь ПОДРУГИ: до появления автора у брони она
          // считалась приватной бронью владельца — пропадала у автора и
          // показывалась хозяйке.
          { kind: "FLIGHT", name: `${TAG} рейс подруги`, startAt: new Date("2031-10-22T02:00:00.000Z"), visibility: "PRIVATE", createdById: member.id },
        ],
      },
    },
    select: { id: true, slug: true },
  });

  await prisma.eventAttendance.createMany({
    data: [
      { userId: owner.id, eventId: common.id, occurrenceId: common.occurrences[0].id },
      { userId: member.id, eventId: late.id, occurrenceId: late.occurrences[0].id },
    ],
  });

  const session = async (userId: string) =>
    (
      await prisma.userSession.create({
        data: { userId, expiresAt: new Date(Date.now() + 86_400_000) },
        select: { id: true },
      })
    ).id;

  console.log(
    JSON.stringify({
      tag: TAG,
      slug: trip.slug,
      ownerSession: await session(owner.id),
      memberSession: await session(member.id),
      strangerSession: await session(stranger.id),
    }),
  );
}

/** Чистим ВСЁ, что осталось от прежних прогонов: слаг у каждого свой,
 *  поэтому ищем по общему префиксу. */
async function cleanup() {
  await prisma.trip.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.event.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

const run = process.argv.includes("--clean") ? cleanup() : main();
run
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
