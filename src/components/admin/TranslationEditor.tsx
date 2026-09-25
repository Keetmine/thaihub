import SubmitButton from "@/components/admin/SubmitButton";
import { saveEntityTranslations } from "@/app/admin/(protected)/translations/entityActions";
import {
  TRANSLATABLE_FIELDS,
  parseTranslations,
  type TranslatableEntity,
} from "@/lib/entityTranslations";

/**
 * Блок «Перевод на русский» в форме записи каталога — общий для всех
 * пяти сущностей (правка владельца 2026-09-10: «нужно, чтобы в админке
 * это было удобно, мб отдельный блок с дублированием всех полей»).
 *
 * Оригинал стоит СЛЕВА и только для чтения, перевод — справа: иначе
 * переводить приходится по памяти, переключаясь между вкладками. Пустое
 * поле означает «не переводили» — на витрине покажется оригинал.
 *
 * Своя форма, а не часть основной формы записи: сохранение перевода не
 * должно требовать прохода валидации всей карточки, а правка карточки —
 * тащить за собой перевод.
 */
export default function TranslationEditor({
  entity,
  id,
  /** Оригиналы полей — по именам из TRANSLATABLE_FIELDS. */
  original,
  translations,
  /** Готовые значения перевода для сущностей, чьи переводы лежат
   *  КОЛОНКАМИ, а не в json (сериал: titleRu/synopsisRu). */
  values,
  omit = [],
}: {
  entity: TranslatableEntity;
  id: string;
  original: Record<string, string | string[] | null | undefined>;
  translations?: unknown;
  values?: Record<string, string | null | undefined>;
  /** Поля, которые правятся в другом месте. Их нет в форме — и
   *  сохранение их не трогает (см. saveEntityTranslations). */
  omit?: string[];
}) {
  const ru: Record<string, string | string[] | null | undefined> =
    values ?? parseTranslations(translations).ru ?? {};
  const fields = TRANSLATABLE_FIELDS[entity].filter((f) => !omit.includes(f.name));

  const asText = (value: string | string[] | null | undefined): string =>
    Array.isArray(value) ? value.join("\n") : (value ?? "");

  return (
    <form action={saveEntityTranslations} className="surface p-4">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
        <h2 className="section-heading mb-0">Перевод на русский</h2>
        <span className="small text-secondary">
          переведено: {fields.filter((f) => asText(ru[f.name]).trim()).length} из {fields.length}
        </span>
      </div>
      <p className="small text-secondary mb-3">
        Слева — как записано в каталоге, справа — что увидит русская
        версия сайта. Пустое поле означает «не переводили»: на витрине
        останется оригинал. Списки — по строке на пункт.
      </p>

      <div className="d-flex flex-column gap-3">
        {fields.map((field) => {
          // Построчный перевод (факты артиста): у каждой строки оригинала
          // своё поле, как просила владелец 2026-09-26. Оригинал — текстом,
          // а не выключенным полем: факты длинные, и в поле они резались.
          if (field.aligned) {
            const lines = Array.isArray(original[field.name])
              ? (original[field.name] as string[])
              : asText(original[field.name]).split("\n").filter((l) => l.trim());
            const current = ru[field.name];
            const ruLines = Array.isArray(current) ? current : [];
            return (
              <div key={field.name}>
                <label className="form-label small text-secondary mb-1">
                  {field.label} — по полю на каждый
                </label>
                {lines.length === 0 ? (
                  <p className="small text-secondary mb-0">
                    Оригинала нет — сначала заполните поле во вкладке «Основное».
                  </p>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {lines.map((line, i) => (
                      <div key={i} className="translation-line row g-2">
                        <div className="col-12 col-lg-6">
                          <div className="translation-line-source small">
                            <span className="text-secondary me-1">{i + 1}.</span>
                            {line}
                          </div>
                        </div>
                        <div className="col-12 col-lg-6">
                          <textarea
                            name={`ru:${field.name}`}
                            defaultValue={ruLines[i] ?? ""}
                            rows={2}
                            className="form-control form-control-sm facts-input"
                            aria-label={`${field.label} №${i + 1}: перевод`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          const source = asText(original[field.name]);
          const value = asText(ru[field.name]);
          // Поля, которых у записи нет вовсе, показываем всё равно:
          // перевод бывает нужен и там, где оригинал ещё не заполнен
          // (владелец пишет по-русски, английское догрузит импорт).
          const rows = field.kind === "line" ? 1 : field.kind === "list" ? 4 : 6;
          return (
            <div key={field.name} className="row g-2">
              <div className="col-12">
                <label className="form-label small text-secondary mb-1">{field.label}</label>
              </div>
              <div className="col-12 col-lg-6">
                {field.kind === "line" ? (
                  <input
                    value={source}
                    readOnly
                    disabled
                    className="form-control form-control-sm"
                    aria-label={`${field.label}: оригинал`}
                  />
                ) : (
                  <textarea
                    value={source}
                    readOnly
                    disabled
                    rows={rows}
                    className="form-control form-control-sm"
                    aria-label={`${field.label}: оригинал`}
                  />
                )}
              </div>
              <div className="col-12 col-lg-6">
                {field.kind === "line" ? (
                  <input
                    name={`ru:${field.name}`}
                    defaultValue={value}
                    className="form-control form-control-sm"
                    aria-label={`${field.label}: перевод`}
                  />
                ) : (
                  <textarea
                    name={`ru:${field.name}`}
                    defaultValue={value}
                    rows={rows}
                    className="form-control form-control-sm"
                    aria-label={`${field.label}: перевод`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <SubmitButton label="Сохранить перевод" busyLabel="Сохраняем…" className="btn btn-primary btn-sm" />
      </div>
    </form>
  );
}
