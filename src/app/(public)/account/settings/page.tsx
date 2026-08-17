import { TIMEZONES } from "@/lib/timezones";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/userAuth";
import FileDropzone from "@/components/FileDropzone";
import { updateProfile, updatePrivacy, getOrCreateIcsToken } from "../actions";
import ChangePasswordForm from "./ChangePasswordForm";
import IcsFeedSection from "./IcsFeedSection";
import SettingsTabs from "./SettingsTabs";

export const dynamic = "force-dynamic";

const PRIVACY_TOGGLES = [
  {
    name: "hideProfileActivity",
    label: "Скрыть всю активность",
    hint: "Не-друзья увидят только имя и фото.",
  },
  { name: "hideAchievements", label: "Скрыть ачивки", hint: null },
  {
    name: "hideFavoritePerformers",
    label: "Скрыть фан-профиль (любимых актёров)",
    hint: null,
  },
  { name: "hideVisitedPlaces", label: "Скрыть посещённые места", hint: null },
] as const;

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const icsToken = await getOrCreateIcsToken();

  return (
    <div>
      <Link href="/account" className="eyebrow text-decoration-none">
        ← Профиль
      </Link>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        Настройки
      </h1>

      <SettingsTabs
        profile={
          <div className="surface p-4" style={{ maxWidth: "44rem" }}>
            <form action={updateProfile} className="row g-3">
              <div className="col-12 col-md-6 d-flex flex-column gap-3">
                <div>
                  <label className="form-label">Имя</label>
                  <input name="name" defaultValue={user.name ?? ""} className="form-control" />
                </div>
                <div>
                  <label className="form-label">Таймзона</label>
                  <select name="timezone" defaultValue={user.timezone} className="form-select">
                    {TIMEZONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <p className="small text-secondary mb-0 mt-1">
                    Время событий показывается тайское, а в скобках — в этой
                    зоне.
                  </p>
                </div>
                <p className="small text-secondary mb-0">
                  Имя видно друзьям и в публичном профиле.
                </p>
              </div>
              <div className="col-12 col-md-6">
                <FileDropzone name="photoUrl" label="Фото" defaultValue={user.photoUrl ?? ""} />
              </div>
              <div className="col-12">
                <button type="submit" className="btn btn-primary btn-sm">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        }
        privacy={
          <div className="surface p-4" style={{ maxWidth: "44rem" }}>
            <p className="small text-secondary mb-3">
              Друзья видят всё всегда; настройки ниже — для остальных.
            </p>
            <form action={updatePrivacy} className="d-flex flex-column gap-2">
              {PRIVACY_TOGGLES.map((t) => (
                <div className="form-check" key={t.name}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id={t.name}
                    name={t.name}
                    defaultChecked={Boolean(user[t.name])}
                  />
                  <label className="form-check-label small" htmlFor={t.name}>
                    {t.label}
                    {t.hint && <span className="text-secondary d-block">{t.hint}</span>}
                  </label>
                </div>
              ))}
              <div className="mt-2">
                <button type="submit" className="btn btn-primary btn-sm">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        }
        security={
          <div className="surface p-4" style={{ maxWidth: "44rem" }}>
            <ChangePasswordForm />
          </div>
        }
        calendar={
          <div className="surface p-4" style={{ maxWidth: "44rem" }}>
            <IcsFeedSection token={icsToken} />
          </div>
        }
      />
    </div>
  );
}
