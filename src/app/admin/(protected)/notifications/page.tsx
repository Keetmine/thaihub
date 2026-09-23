import { requireAdminPage } from "@/lib/auth";
import SubmitButton from "@/components/admin/SubmitButton";
import ConfirmForm from "@/components/ConfirmForm";
import { NOTIFICATION_TEMPLATES, TEMPLATE_GROUPS } from "@/lib/notificationTemplates";
import { listTemplateRows } from "@/lib/notificationTemplateStore";
import { LOCALES } from "@/lib/i18n";
import { saveNotificationTemplates, resetNotificationTemplate } from "./actions";

export const metadata = { title: "Тексты уведомлений" };

export const dynamic = "force-dynamic";

const LOCALE_LABELS: Record<string, string> = { ru: "Русский", en: "English" };

/**
 * Тексты уведомлений (просьба владельца 2026-09-23: «все подписи
 * выведем в админке, чтоб можно было там же и править»).
 *
 * Правки — накладка поверх словаря: в базе живут только переписанные
 * строки, остальное берётся из кода (см. lib/notificationTemplates.ts).
 * Поэтому у каждой строки видно, словарный ли это текст или правка, и
 * у правки есть кнопка «Вернуть исходный».
 */
export default async function AdminNotificationTemplatesPage() {
  await requireAdminPage();
  const rows = await listTemplateRows();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const changed = rows.filter((r) => LOCALES.some((l) => r.byLocale[l].overridden)).length;

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2.25rem" }}>
        Тексты уведомлений
      </h1>
      <p className="text-secondary" style={{ maxWidth: "56rem" }}>
        Что человек видит в колокольчике и получает в Telegram. Переменные в
        фигурных скобках подставляются при отправке — их нужно оставить как
        есть: <code>{"{who}"}</code> — имя, <code>{"{event}"}</code> — название
        события и так далее (у каждой строки подписано, какие есть).
        Пустое поле или текст, совпавший с исходным, сбрасывает правку: тогда
        строка снова берётся из кода и меняется с обновлениями сайта.
        {changed > 0 && <> Сейчас переписано строк: {changed}.</>}
      </p>

      <form action={saveNotificationTemplates} className="d-flex flex-column gap-3">
        {TEMPLATE_GROUPS.map((group) => {
          const defs = NOTIFICATION_TEMPLATES.filter((d) => d.group === group.key);
          if (defs.length === 0) return null;
          return (
            <section key={group.key} className="admin-section">
              <div className="admin-section-head">
                <span className="admin-section-title">{group.title}</span>
                <span className="admin-section-hint">{group.hint}</span>
              </div>

              <div className="d-flex flex-column gap-3">
                {defs.map((def) => {
                  const row = byKey.get(def.key);
                  if (!row) return null;
                  return (
                    <div key={def.key} className="admin-template-row">
                      <div className="d-flex flex-wrap align-items-baseline gap-2 mb-1">
                        <span className="fw-semibold">{def.label}</span>
                        {def.vars.length > 0 && (
                          <span className="small text-secondary">
                            переменные:{" "}
                            {def.vars.map((v) => (
                              <code key={v} className="me-1">{`{${v}}`}</code>
                            ))}
                          </span>
                        )}
                      </div>

                      <div className="row g-2">
                        {LOCALES.map((locale) => {
                          const cell = row.byLocale[locale];
                          return (
                            <div key={locale} className="col-12 col-lg-6">
                              <label
                                className="form-label small text-secondary d-flex align-items-center gap-2 mb-1"
                                htmlFor={`${def.key}::${locale}`}
                              >
                                {LOCALE_LABELS[locale] ?? locale}
                                {cell.overridden && (
                                  <span className="badge rounded-pill text-bg-secondary">
                                    переписано
                                  </span>
                                )}
                              </label>
                              <textarea
                                id={`${def.key}::${locale}`}
                                name={`${def.key}::${locale}`}
                                defaultValue={cell.current}
                                rows={2}
                                className="form-control"
                              />
                              {cell.overridden && (
                                <p className="small text-secondary mb-0 mt-1">
                                  Исходный текст: {cell.fallback}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* Кнопка внизу одна: страница длинная, но сохраняется целиком —
            как /admin/settings. */}
        <div className="d-flex align-items-center gap-3">
          <SubmitButton label="Сохранить тексты" busyLabel="Сохраняем…" />
          <span className="small text-secondary">
            Сохранится всё сразу; строки, совпавшие с исходными, вернутся к коду.
          </span>
        </div>
      </form>

      {/* Сброс — отдельными формами, а не внутри общей: вложенных форм в
          HTML не бывает, а один сброс не должен утащить с собой
          несохранённые правки соседей. */}
      {changed > 0 && (
        <section className="admin-section mt-3">
          <div className="admin-section-head">
            <span className="admin-section-title">Переписанные строки</span>
            <span className="admin-section-hint">
              Вернуть текст из кода — по одной; остальные правки не тронутся.
            </span>
          </div>
          <div className="d-flex flex-column gap-2">
            {rows.flatMap((row) =>
              LOCALES.filter((l) => row.byLocale[l].overridden).map((locale) => {
                const def = NOTIFICATION_TEMPLATES.find((d) => d.key === row.key);
                return (
                  <div
                    key={`${row.key}:${locale}`}
                    className="d-flex flex-wrap align-items-center justify-content-between gap-2"
                  >
                    <span className="small">
                      <span className="fw-semibold">{def?.label ?? row.key}</span>{" "}
                      <span className="text-secondary">
                        ({LOCALE_LABELS[locale] ?? locale}) — {row.byLocale[locale].current}
                      </span>
                    </span>
                    <ConfirmForm
                      action={async () => {
                        "use server";
                        await resetNotificationTemplate(row.key, locale);
                      }}
                      confirmMessage="Вернуть исходный текст из кода?"
                      confirmLabel="Вернуть исходный"
                    >
                      <button type="button" className="btn btn-ghost btn-sm flex-shrink-0">
                        Вернуть исходный
                      </button>
                    </ConfirmForm>
                  </div>
                );
              }),
            )}
          </div>
        </section>
      )}
    </div>
  );
}
