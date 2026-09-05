import { prisma } from "@/lib/prisma";
async function main() {
  const until = new Date(Date.now() + 3600_000);
  await prisma.user.update({ where: { email: "admin-e2e@test.local" }, data: { premiumUntil: until } });
  console.log("премиум выдан на час");
  await prisma.$disconnect();
}
main();
