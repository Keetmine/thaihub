import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SETTING_KEYS } from "@/lib/siteSettings";
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

      <form action={saveSettings} className="surface d-flex flex-column gap-3 p-4" style={{ maxWidth: "36rem" }}>
        {SETTING_KEYS.map((s) => (
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
        <div>
          <button type="submit" className="btn btn-primary btn-sm">Сохранить</button>
        </div>
      </form>
    </div>
  );
}
