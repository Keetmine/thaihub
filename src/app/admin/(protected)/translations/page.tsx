import Link from "next/link";
import SubmitButton from "@/components/admin/SubmitButton";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import {
  CONTENT_DICT_DEFAULTS,
  CONTENT_DICT_KINDS,
  CONTENT_DICT_TITLES,
  contentDictKey,
  type ContentDictKind,
} from "@/lib/contentDictionary";
import { saveContentTranslations } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Правимый словарь повторяющихся значений каталога (правка владельца
 * 2026-09-10: «выведем в настройки, чтобы я могла сама менять
 * переводы»).
 *
 * Список НЕ придуман руками: каждая строка — значение, которое реально
 * встречается в базе, с числом записей. Поэтому непереведённое видно
 * само собой, а не всплывает через полгода на витрине: свежий жанр из
 * импорта появится тут первым же заходом, сверху пустым полем.
 *
 * Значения по умолчанию живут в коде (contentDictionary.ts) и стоят в
 * полях подсказкой-плейсхолдером. В базу пишется только то, что от них
 * отличается, — см. saveContentTranslations.
 */

/** Что и откуда собираем: вид словаря → живые значения из каталога. */
async function collectSources(): Promise<Record<ContentDictKind, { value: string; count: number }[]>> {
  const rows = async (sql: Promise<{ v: string | null; n: bigint }[]>) =>
    (await sql)
      .filter((r): r is { v: string; n: bigint } => !!r.v?.trim())
      .map((r) => ({ value: r.v, count: Number(r.n) }));

  const [genre, country, dramaType, performerCountry, occupation, instrument] = await Promise.all([
    rows(prisma.$queryRaw`SELECT g v, COUNT(*) n FROM "Drama", unnest(genres) g GROUP BY g ORDER BY n DESC`),
    rows(prisma.$queryRaw`SELECT country v, COUNT(*) n FROM "Drama" WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC`),
    rows(prisma.$queryRaw`SELECT type v, COUNT(*) n FROM "Drama" WHERE type IS NOT NULL GROUP BY type ORDER BY n DESC`),
    rows(prisma.$queryRaw`SELECT nationality v, COUNT(*) n FROM "Performer" WHERE nationality IS NOT NULL GROUP BY nationality ORDER BY n DESC`),
    rows(prisma.$queryRaw`SELECT o v, COUNT(*) n FROM "Performer", unnest(occupation) o GROUP BY o ORDER BY n DESC`),
    rows(prisma.$queryRaw`SELECT i v, COUNT(*) n FROM "Performer", unnest(instruments) i GROUP BY i ORDER BY n DESC`),
  ]);
  return { genre, country, dramaType, performerCountry, occupation, instrument };
}

export default async function TranslationsPage() {
  await requireCatalogEditor();

  const [sources, saved] = await Promise.all([
    collectSources(),
    prisma.contentTranslation.findMany({ select: { kind: true, source: true, ru: true } }),
  ]);
  const savedByKey = new Map(saved.map((r) => [`${r.kind}::${r.source}`, r.ru]));

  return (
    <div>
      <Link href="/admin" className="eyebrow text-decoration-none">
        ← Админка
      </Link>
      <h1 className="display-1-tight mt-3 mb-3" style={{ fontSize: "2rem" }}>
        Словарь каталога
      </h1>
      <p className="text-secondary mb-4" style={{ maxWidth: "44rem" }}>
        Жанры, страны, типы, занятия и инструменты приходят из импорта
        по-английски и повторяются тысячи раз — поэтому переводятся не у
        каждой записи, а здесь, один раз на всё. В списке только те
        значения, которые реально есть в базе; рядом — сколько записей их
        используют. Серым в поле стоит перевод по умолчанию: пустое поле
        означает «оставить как есть», и на витрине покажется он. Чтобы
        вернуть умолчание, очистите поле.
      </p>

      <div className="d-flex flex-column gap-4">
        {CONTENT_DICT_KINDS.map((kind) => {
          const values = sources[kind];
          const untranslated = values.filter(
            (v) =>
              !savedByKey.has(`${kind}::${contentDictKey(v.value)}`) &&
              !CONTENT_DICT_DEFAULTS[kind][contentDictKey(v.value)],
          ).length;
          return (
            <form key={kind} action={saveContentTranslations} className="surface p-4">
              <input type="hidden" name="kind" value={kind} />
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <h2 className="section-heading mb-0">
                  {CONTENT_DICT_TITLES[kind]} ({values.length})
                </h2>
                {/* Непереведённое — числом сразу в заголовке: иначе его
                    надо искать глазами по всему списку. */}
                {untranslated > 0 && (
                  <span className="badge rounded-pill text-bg-warning">
                    без перевода: {untranslated}
                  </span>
                )}
              </div>
              {values.length === 0 ? (
                <p className="small text-secondary mb-0">
                  В каталоге пока нет ни одного значения этого вида.
                </p>
              ) : (
                <>
                  <div className="row g-2">
                    {values.map((v) => {
                      const key = contentDictKey(v.value);
                      const current = savedByKey.get(`${kind}::${key}`) ?? "";
                      const fallback = CONTENT_DICT_DEFAULTS[kind][key] ?? "";
                      return (
                        <div key={v.value} className="col-12 col-md-6 col-xl-4">
                          <label className="form-label small text-secondary mb-1">
                            {v.value}{" "}
                            <span style={{ opacity: 0.6 }}>· {v.count}</span>
                          </label>
                          <input
                            name={`ru:${v.value}`}
                            defaultValue={current}
                            placeholder={fallback || "нет перевода"}
                            className="form-control form-control-sm"
                            autoComplete="off"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    <SubmitButton
                      label="Сохранить"
                      busyLabel="Сохраняем…"
                      className="btn btn-primary btn-sm"
                    />
                  </div>
                </>
              )}
            </form>
          );
        })}
      </div>
    </div>
  );
}
