import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.eventPerformer.deleteMany();
  await prisma.event.deleteMany();
  await prisma.performer.deleteMany();

  const artists = await Promise.all([
    prisma.performer.create({ data: { name: "Bodyslam", type: "BAND" } }),
    prisma.performer.create({ data: { name: "Palmy", type: "SOLO" } }),
    prisma.performer.create({ data: { name: "Slot Machine", type: "BAND" } }),
    prisma.performer.create({ data: { name: "Getsunova", type: "BAND" } }),
  ]);

  const today = new Date();
  const day = (offset: number, hour: number, minute = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  await prisma.event.create({
    data: {
      title: "Bodyslam Live in Bangkok",
      venue: "Impact Arena, Bangkok",
      startsAt: day(2, 19, 0),
      endsAt: day(2, 22, 0),
      description: "Большой концерт в Impact Arena.",
      performers: { create: [{ performerId: artists[0].id }] },
    },
  });

  await prisma.event.create({
    data: {
      title: "Palmy Acoustic Night",
      venue: "Live Café, Chiang Mai",
      startsAt: day(2, 20, 30),
      endsAt: day(2, 22, 30),
      performers: { create: [{ performerId: artists[1].id }] },
    },
  });

  await prisma.event.create({
    data: {
      title: "Rock Fest: Slot Machine & Getsunova",
      venue: "Lumpini Park, Bangkok",
      startsAt: day(7, 18, 0),
      endsAt: day(7, 23, 0),
      description: "Открытый фестиваль под открытым небом.",
      performers: {
        create: [{ performerId: artists[2].id }, { performerId: artists[3].id }],
      },
    },
  });

  await prisma.event.create({
    data: {
      title: "Getsunova Acoustic Session",
      venue: "Warehouse 30, Bangkok",
      startsAt: day(-1, 19, 30),
      endsAt: day(-1, 21, 0),
      performers: { create: [{ performerId: artists[3].id }] },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
