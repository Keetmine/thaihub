import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SETTING_KEYS, SETTING_GROUPS } from "@/lib/siteSettings";
import SubmitButton from "@/components/admin/SubmitButton";
import { saveSettings } from "./actions";

export const metadata = { title: "Настройки" };

export const dynamic = "force-dynamic";

// Настройки сайта без деплоя: значения хранятся в SiteSetting, пустое
// поле = «использовать дефолт из кода/env».
export default async function AdminSettingsPage() {
  await requireAdminPage();
  const rows = await prisma.siteSetting.findMany();
  const values = new Map(rows.map((r) => [r.key, r.value]));

  return (
    <div>
      <span className="eyebrow">Сервис</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.25rem" }}>
        Настройки
      </h1>

      {/* Одна форма на все разделы: настройки сохраняются вместе, а
          разбивка — про читаемость, а не про раздельное сохранение. */}
      <form action={saveSettings} className="d-flex flex-column gap-3">
        <div className="row g-3">
          {SETTING_GROUPS.map((group) => {
            const items = SETTING_KEYS.filter((s) => s.group === group.key);
            if (items.length === 0) return null;
            return (
              <div key={group.key} className="col-12 col-xl-6">
                <section className="admin-section h-100">
                  <div className="admin-section-head">
                    <span className="admin-section-title">{group.title}</span>
                    <span className="admin-section-hint">{group.hint}</span>
                  </div>
                  <div className="d-flex flex-column gap-3">
                    {items.map((s) => (
                      <div key={s.key}>
                        <label className="form-label">{s.label}</label>
                        <input
                          name={s.key}
                          defaultValue={values.get(s.key) ?? ""}
                          placeholder={s.hint}
                          className="form-control"
                        />
                        <p className="small text-secondary mb-0 mt-1">{s.hint}. Пусто — дефолт.</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            );
          })}
        </div>
        <div>
          <SubmitButton label="Сохранить" busyLabel="Сохранение…" />
        </div>
      </form>
    </div>
  );
}
