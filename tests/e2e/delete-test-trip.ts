import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Out-of-process по той же причине, что cleanup-test-user.ts (Prisma
// ESM-only). Удаляет ровно одну поездку по id — тот, что напечатал
// create-test-trip-booking.ts. Брони, дела и участники уходят каскадом.
// Никакого поиска «по названию» и никаких deleteMany по шаблону: база
// локальная и живая, в ней данные владельца проекта.
const id = process.argv[2];
if (!id) throw new Error("usage: tsx delete-test-trip.ts <tripId>");

prisma.trip
  .deleteMany({ where: { id } })
  .finally(() => prisma.$disconnect());
