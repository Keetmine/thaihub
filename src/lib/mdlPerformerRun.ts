import { logImportRun } from "@/lib/importRun";
import { importMdlPerformer } from "@/lib/mdlPerformerImport";
import { progressWriter } from "@/app/admin/(protected)/imports/progressWriter";

/**
 * Фоновый импорт одного человека с MyDramaList с записью в журнал.
 * Общий для раздела импортов и кнопки «Обновить инфу» на странице
 * артиста. Возвращает id прогона, как только запись заведена, — сам
 * импорт идёт дальше без ожидания (с фильмографией это до 25 страниц
 * сериалов), а ход пишется в `ImportRun.summary`.
 */
export function launchMdlPerformerImport(opts: {
  url: string;
  performerId?: string;
  withFilmography: boolean;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    let started = false;
    void logImportRun(
      "mdl-performer",
      (runId) =>
        importMdlPerformer(opts.url, opts.performerId, runId, {
          withFilmography: opts.withFilmography,
          onProgress: progressWriter(runId),
        }),
      (r) =>
        `${r.name}: ${r.created ? "создан" : "обновлён"}` +
        (r.filled.length ? `, заполнено — ${r.filled.join(", ")}` : ", новых полей нет") +
        (r.linksAdded ? `, ссылок +${r.linksAdded}` : "") +
        (r.linkConflicts
          ? `, сеть занята у ${r.linkConflicts} ссыл. (у артиста другой хендл — проверьте руками)`
          : "") +
        (r.dramasLinked ? `, привязано сериалов ${r.dramasLinked}` : "") +
        (r.dramasCreated ? `, заведено сериалов ${r.dramasCreated}` : "") +
        (r.dramasEnriched ? `, дозаполнено сериалов ${r.dramasEnriched}` : "") +
        (r.dramasFailed ? `, не открылось ${r.dramasFailed}` : "") +
        (r.dramasSkipped ? ` (${r.dramasSkipped} нет в каталоге)` : ""),
      (runId) => {
        started = true;
        resolve(runId);
      },
    ).catch((e) => {
      // Падение уже записано в журнал самим logImportRun. Если же не
      // удалось даже завести запись — сообщаем тому, кто запускал.
      if (!started) reject(e);
    });
  });
}
