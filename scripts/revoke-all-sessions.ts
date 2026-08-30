import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * Разлогинить ВСЕХ — разовая аварийная операция.
 *
 * ⚠️ Это не уборка и НЕ ДЛЯ АВТОЗАПУСКА. Скрипт сносит все сессии
 * разом: каждого пользователя, включая владельца сайта, выкинет из
 * аккаунта на всех устройствах, и всем придётся входить заново.
 * Применять, только если есть подозрение на утечку (украденная кука,
 * скомпрометированный дамп, чужой доступ к серверу).
 *
 * Зачем вообще. Смена и сброс пароля теперь гасят остальные сессии
 * человека, но выданные ДО этой правки живут как жили: срок сессии —
 * 30 дней (SESSION_DAYS в src/lib/userAuth.ts), так что украденная
 * когда-то кука ещё может работать. Одномоментный сброс — единственный
 * способ обнулить этот хвост целиком.
 *
 * Запуск:
 *   npx tsx --env-file=.env scripts/revoke-all-sessions.ts          # черновик, только счёт
 *   npx tsx --env-file=.env scripts/revoke-all-sessions.ts --apply  # разлогинить всех
 *
 * Модель одна — UserSession. Отдельных серверных админ-сессий больше
 * нет: админ-доступ стал ролью обычного пользователя (User.isAdmin, см.
 * src/lib/auth.ts), старую AdminSession убрали из схемы. Значит, снести
 * UserSession действительно достаточно, чтобы разлогинило и админку.
 */

const apply = process.argv.includes("--apply");

const STALE_DAYS = 30;

async function main() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

  let total: number;
  let expired: number;
  let stale: number;
  let users: number;
  try {
    [total, expired, stale, users] = await Promise.all([
      prisma.userSession.count(),
      // Просроченные: getCurrentUser их уже не принимает, но строки лежат.
      prisma.userSession.count({ where: { expiresAt: { lt: now } } }),
      // «Протухшие, но живые»: выданы больше 30 дней назад и всё ещё
      // действуют — то есть кто-то не перелогинивался месяцами.
      prisma.userSession.count({ where: { createdAt: { lt: staleBefore }, expiresAt: { gte: now } } }),
      prisma.userSession
        .findMany({ distinct: ["userId"], select: { userId: true } })
        .then((rows) => rows.length),
    ]);
  } catch (err) {
    console.error("Ошибка чтения БД — ничего не удаляем:", err);
    process.exitCode = 1;
    return;
  }

  console.log(`Сессий всего: ${total} (у ${users} пользователей).`);
  console.log(`  из них просроченных (уже не пускают): ${expired}`);
  console.log(`  выданы больше ${STALE_DAYS} дней назад и всё ещё живы: ${stale}`);

  if (!apply) {
    console.log(
      `\nЧерновой прогон — ничего не удалено. С --apply будет удалено ${total} сессий,\n` +
        `и это РАЗЛОГИНИТ ВСЕХ ${users} пользователей разом, включая владельца.\n` +
        "Делать это стоит только при подозрении на утечку.",
    );
    return;
  }

  try {
    const { count } = await prisma.userSession.deleteMany({});
    console.log(
      `\nУдалено сессий: ${count}. ВСЕ пользователи (включая владельца) разлогинены —\n` +
        "войти заново придётся всем.",
    );
  } catch (err) {
    console.error("Ошибка удаления сессий:", err);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
