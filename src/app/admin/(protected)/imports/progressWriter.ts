import { prisma } from "@/lib/prisma";

/**
 * Пишет ход длинного прогона в `run.summary` — страница импортов
 * перечитывает его раз в 4 секунды, пока есть RUNNING. Общий для
 * фоновых пачек (заявки MDL, одобрение черновиков событий) и одиночных
 * прогонов из actions.ts; лежит отдельным модулем, потому что из
 * "use server"-файла экспортировать можно только async-экшены.
 *
 * Не чаще раза в две секунды: на обходе в тысячу страниц апдейт на
 * каждый шаг — это тысяча лишних запросов в БД. И только пока прогон
 * идёт (`updateMany` со статусом): последняя запись прогресса может
 * уйти в БД уже после того, как logImportRun поставил итоговую
 * сводку, и без фильтра затёрла бы её обратно на «импортируем 998
 * из 1000».
 */
export function progressWriter(runId: string): (message: string) => void {
  let lastWrite = 0;
  return (message: string) => {
    const now = Date.now();
    if (now - lastWrite < 2000) return;
    lastWrite = now;
    void prisma.importRun
      .updateMany({
        where: { id: runId, status: "RUNNING" },
        data: { summary: message.slice(0, 500) },
      })
      // Без .catch отклонённый промис ронял бы процесс unhandledRejection;
      // молча глотать тоже нельзя — иначе про отвалившуюся БД не узнать.
      .catch(console.error);
  };
}
