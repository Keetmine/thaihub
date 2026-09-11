/**
 * Убирает из каталога другие нарезки сериалов — «… Uncut»,
 * «… (Acoustic Ver.)», «… Director's Cut» (правка владельца
 * 2026-09-11). Правило разбора названий — общее с импортом,
 * `src/lib/dramaVersionTitle.ts`.
 *
 *   npx tsx scripts/cleanup-drama-versions.ts            # только показать
 *   npx tsx scripts/cleanup-drama-versions.ts --apply    # перенести и удалить
 *
 * ЧТО ДЕЛАЕТ С ЧУЖИМИ ДАННЫМИ. У нарезки бывают статусы просмотра,
 * оценки, отметки серий, отзывы и комментарии живых людей. Удалять их
 * нельзя: человек смотрел этот сериал, просто отметил его на странице
 * версии. Поэтому всё это СНАЧАЛА ПЕРЕЕЗЖАЕТ на базовый сериал и только
 * потом запись удаляется. Если у человека на базовом уже есть своя
 * строка — его собственная и остаётся, строка с версии выбрасывается:
 * она заведомо старее и беднее (у базового сериала серий больше).
 *
 * ЧЕГО НЕ ДЕЛАЕТ:
 * - не трогает запись, для которой базового сериала НЕТ в каталоге:
 *   удалить её — значит убрать сериал с сайта совсем;
 * - не трогает «сомнительные» (маркер через пробел без подтверждения):
 *   «Love Uncut» и «Behind Cut» — настоящие сериалы;
 * - не трогает «… Special Episode» и «… Special»: это отдельная серия
 *   со своим содержанием, а не другая нарезка.
 */
import { prisma } from "@/lib/prisma";
import {
  looseKey,
  parseDramaVersionTitle,
  type DramaVersionMatch,
} from "@/lib/dramaVersionTitle";

const APPLY = process.argv.includes("--apply");

type Row = {
  id: string;
  title: string;
  slug: string | null;
  version: DramaVersionMatch;
  base: { id: string; title: string } | null;
  /** Подтверждение слабого признака связью MDL «… original story». */
  byRelation: boolean;
};

/** Переносит строки одной таблицы на базовый сериал, не затирая то, что
 *  у человека там уже есть. Возвращает «перенесли / бросили». */
async function moveUserRows(
  label: string,
  existingUserIds: Set<string>,
  rows: { userId: string }[],
  move: (userId: string) => Promise<void>,
  drop: (userId: string) => Promise<void>,
): Promise<string> {
  let moved = 0;
  let dropped = 0;
  for (const r of rows) {
    if (existingUserIds.has(r.userId)) {
      if (APPLY) await drop(r.userId);
      dropped += 1;
    } else {
      if (APPLY) await move(r.userId);
      moved += 1;
    }
  }
  if (moved === 0 && dropped === 0) return "";
  return `${label}: перенесено ${moved}${dropped ? `, отброшено как дубль ${dropped}` : ""}`;
}

async function main() {
  const all = await prisma.drama.findMany({
    select: {
      id: true,
      title: true,
      slug: true,
      // Обе стороны Related Content: подпись отношения на MDL заводят
      // руками и нередко с той стороны, с которой удобнее было
      // редактору. У «Shine (Acoustic Ver.)» «original story» стоит на
      // стороне базового, а не версии — если смотреть одну сторону,
      // связь потеряется.
      relatedFrom: {
        select: { relation: true, related: { select: { id: true, title: true } } },
      },
      relatedTo: { select: { relation: true, drama: { select: { id: true, title: true } } } },
    },
  });
  const byTitle = new Map<string, { id: string; title: string }[]>();
  for (const d of all) {
    const k = looseKey(d.title);
    const arr = byTitle.get(k);
    if (arr) arr.push(d);
    else byTitle.set(k, [d]);
  }

  const rows: Row[] = [];
  const doubtful: string[] = [];
  for (const d of all) {
    const version = parseDramaVersionTitle(d.title);
    if (!version) continue;

    // Базовый сериал ищем СНАЧАЛА по связи MDL, и только потом по
    // названию. Связь указывает на конкретную запись, а название — нет:
    // «Shine» в каталоге два (корейский фильм 2023 и тайский сериал
    // 2025), и по имени выбрать нельзя; а у «Jack & Joker: U Steal My
    // Heart! (Uncut Ver.)» базовый записан короче — «Jack & Joker», и по
    // названию не находится вовсе.
    const linked = [
      ...d.relatedFrom.map((r) => ({ relation: r.relation, other: r.related })),
      ...d.relatedTo.map((r) => ({ relation: r.relation, other: r.drama })),
    ].filter((r) => /original story|compilation/i.test(r.relation ?? ""));
    const uniqueLinked = [...new Map(linked.map((r) => [r.other.id, r.other])).values()];

    const byTitleRows = byTitle.get(looseKey(version.base)) ?? [];
    const byRelation = uniqueLinked.length === 1;
    const base = byRelation
      ? uniqueLinked[0]
      : byTitleRows.length === 1
        ? byTitleRows[0]
        : null;

    if (version.needsProof && !base) {
      doubtful.push(`${d.title} — база «${version.base}» не найдена`);
      continue;
    }
    rows.push({ id: d.id, title: d.title, slug: d.slug, version, base, byRelation });
  }

  console.log(`${APPLY ? "УДАЛЯЕМ" : "ПРОСМОТР (без --apply ничего не меняем)"}\n`);
  console.log(`Сериалов в каталоге: ${all.length}, похоже на нарезки: ${rows.length}\n`);

  let deleted = 0;
  let kept = 0;
  for (const row of rows) {
    if (!row.base) {
      kept += 1;
      console.log(`ОСТАВЛЯЕМ  ${row.title}`);
      console.log(
        `           базового «${row.version.base}» в каталоге нет (и связь MDL не указывает на него)`,
      );
      continue;
    }

    const [statuses, episodes, reviews, comments, counts] = await Promise.all([
      prisma.dramaWatchStatus.findMany({ where: { dramaId: row.id }, select: { userId: true } }),
      prisma.episodeWatch.findMany({
        where: { dramaId: row.id },
        select: { userId: true, episode: true },
      }),
      prisma.review.findMany({ where: { dramaId: row.id }, select: { id: true, userId: true } }),
      prisma.comment.findMany({ where: { dramaId: row.id }, select: { id: true, userId: true } }),
      prisma.drama.findUnique({
        where: { id: row.id },
        select: { _count: { select: { events: true, locations: true, performers: true } } },
      }),
    ]);

    const notes: string[] = [];

    if (statuses.length > 0) {
      const onBase = new Set(
        (
          await prisma.dramaWatchStatus.findMany({
            where: { dramaId: row.base.id, userId: { in: statuses.map((s) => s.userId) } },
            select: { userId: true },
          })
        ).map((s) => s.userId),
      );
      notes.push(
        await moveUserRows(
          "статусы просмотра",
          onBase,
          statuses,
          (userId) =>
            prisma.dramaWatchStatus
              .update({
                where: { userId_dramaId: { userId, dramaId: row.id } },
                data: { dramaId: row.base!.id },
              })
              .then(() => undefined),
          (userId) =>
            prisma.dramaWatchStatus
              .delete({ where: { userId_dramaId: { userId, dramaId: row.id } } })
              .then(() => undefined),
        ),
      );
    }

    if (episodes.length > 0) {
      // Ключ здесь тройной (человек + сериал + номер серии), поэтому
      // сверяем по паре, а не по одному userId.
      const onBase = new Set(
        (
          await prisma.episodeWatch.findMany({
            where: { dramaId: row.base.id, userId: { in: episodes.map((e) => e.userId) } },
            select: { userId: true, episode: true },
          })
        ).map((e) => `${e.userId}#${e.episode}`),
      );
      let moved = 0;
      let dropped = 0;
      for (const e of episodes) {
        const key = { userId_dramaId_episode: { userId: e.userId, dramaId: row.id, episode: e.episode } };
        if (onBase.has(`${e.userId}#${e.episode}`)) {
          if (APPLY) await prisma.episodeWatch.delete({ where: key });
          dropped += 1;
        } else {
          if (APPLY) await prisma.episodeWatch.update({ where: key, data: { dramaId: row.base.id } });
          moved += 1;
        }
      }
      notes.push(`отметки серий: перенесено ${moved}${dropped ? `, дублей ${dropped}` : ""}`);
    }

    if (reviews.length > 0) {
      // На объект у человека один отзыв (@@unique([userId, dramaId])) —
      // если на базовом он уже есть, свой с версии не переносим.
      const onBase = new Set(
        (
          await prisma.review.findMany({
            where: { dramaId: row.base.id, userId: { in: reviews.map((r) => r.userId) } },
            select: { userId: true },
          })
        ).map((r) => r.userId),
      );
      let moved = 0;
      let keptOwn = 0;
      for (const r of reviews) {
        if (onBase.has(r.userId)) {
          keptOwn += 1;
          continue;
        }
        if (APPLY) await prisma.review.update({ where: { id: r.id }, data: { dramaId: row.base.id } });
        moved += 1;
      }
      // Отзыв — написанный человеком текст: не переносим, но и НЕ
      // удаляем молча. Останется у базового только тот, что переехал;
      // про остальные печатаем громко, чтобы владелец решила сама.
      notes.push(
        `отзывы: перенесено ${moved}` +
          (keptOwn ? `, ВНИМАНИЕ: ${keptOwn} останется без места (у человека уже есть отзыв на базовый)` : ""),
      );
    }

    if (comments.length > 0) {
      if (APPLY) {
        await prisma.comment.updateMany({
          where: { dramaId: row.id },
          data: { dramaId: row.base.id },
        });
      }
      notes.push(`комментарии: перенесено ${comments.length}`);
    }

    // Закрытые заявки «добавьте сериал», которые указывают на нарезку:
    // перевешиваем на базовый. Само удаление их не роняет (в схеме
    // onDelete: SetNull), но заявка осталась бы закрытой в никуда.
    const requests = await prisma.mdlDramaRequest.count({
      where: { resolvedDramaId: row.id },
    });
    if (requests > 0) {
      if (APPLY) {
        await prisma.mdlDramaRequest.updateMany({
          where: { resolvedDramaId: row.id },
          data: { resolvedDramaId: row.base.id },
        });
      }
      notes.push(`заявок: перевешено ${requests}`);
    }

    // Каст, места съёмок и события НЕ пропадают вместе с записью, а
    // доезжают до базового: у нарезки бывает отмечен актёр, которого на
    // базовом ещё не проставили, и терять связь из-за уборки нельзя.
    // Дубли отсекает skipDuplicates — составной ключ у обеих таблиц.
    const castRows = await prisma.performerDrama.findMany({
      where: { dramaId: row.id },
      select: { performerId: true, role: true },
    });
    const onBaseCast = new Set(
      (
        await prisma.performerDrama.findMany({
          where: { dramaId: row.base.id },
          select: { performerId: true },
        })
      ).map((p) => p.performerId),
    );
    const newCast = castRows.filter((p) => !onBaseCast.has(p.performerId));
    if (newCast.length > 0) {
      if (APPLY) {
        await prisma.performerDrama.createMany({
          data: newCast.map((p) => ({ dramaId: row.base!.id, performerId: p.performerId, role: p.role })),
          skipDuplicates: true,
        });
      }
      notes.push(`каст: добавлено базовому ${newCast.length} из ${castRows.length}`);
    } else if (castRows.length > 0) {
      notes.push(`каст ${castRows.length} — весь уже есть у базового`);
    }

    const c = counts!._count;
    if (c.locations > 0) {
      const locRows = await prisma.dramaLocation.findMany({
        where: { dramaId: row.id },
        select: { locationId: true },
      });
      if (APPLY) {
        await prisma.dramaLocation.createMany({
          data: locRows.map((l) => ({ dramaId: row.base!.id, locationId: l.locationId })),
          skipDuplicates: true,
        });
      }
      notes.push(`места съёмок: перенесено ${locRows.length}`);
    }
    if (c.events > 0) {
      if (APPLY) {
        await prisma.event.updateMany({ where: { dramaId: row.id }, data: { dramaId: row.base.id } });
      }
      notes.push(`события: перенесено ${c.events}`);
    }

    console.log(`УДАЛЯЕМ    ${row.title}`);
    console.log(`           → «${row.base.title}»${row.byRelation ? " (подтверждено связью MDL)" : ""}`);
    for (const n of notes.filter(Boolean)) console.log(`           ${n}`);

    if (APPLY) await prisma.drama.delete({ where: { id: row.id } });
    deleted += 1;
  }

  if (doubtful.length > 0) {
    console.log(`\nНЕ ТРОГАЕМ (похоже на настоящие сериалы):`);
    for (const d of doubtful) console.log(`  ${d}`);
  }

  console.log(
    `\nИТОГО: ${APPLY ? "удалено" : "будет удалено"} ${deleted}, оставлено ${kept}, ` +
      `сомнительных ${doubtful.length}`,
  );
  if (!APPLY) console.log("Ничего не менялось. Запустите с --apply.");
  await prisma.$disconnect();
}

main();
