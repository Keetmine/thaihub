import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { sendEpisodeNotifications } from "../../src/lib/telegramNotifications";

/**
 * Дёргаем рассылку «вышла серия» руками (З1).
 *
 * В приложении её раз в полчаса зовёт планировщик из
 * src/instrumentation.ts — ждать его в тесте нечего, а сама функция
 * ничего от Next не хочет: только Prisma и словари. Поэтому зовём её
 * прямо, отдельным tsx-процессом, как и остальные фикстуры.
 *
 * Telegram при этом не дёргается: сообщение уходит только тому, у кого
 * привязан telegramId, а у тестового админа его нет (см.
 * create-audit-fixtures.ts). Проверяем сайтовую половину — строку в
 * колокольчике и в ленте /notifications.
 */
async function main() {
  const sent = await sendEpisodeNotifications();
  console.log(`episode notifications sent: ${sent}`);
  if (sent === 0) {
    // Молчаливый ноль потом выглядел бы как пустая лента и «сломанный
    // колокольчик» — пусть падает здесь, с понятной причиной.
    throw new Error("рассылка не отправила ни одного уведомления — фикстура не доехала?");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
