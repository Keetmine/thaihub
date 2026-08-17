import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/userAuth";
import FileDropzone from "@/components/FileDropzone";
import { updateProfile, getOrCreateIcsToken } from "../actions";
import ChangePasswordForm from "./ChangePasswordForm";
import IcsFeedSection from "./IcsFeedSection";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const icsToken = await getOrCreateIcsToken();

  return (
    <div>
      <Link href="/account" className="eyebrow text-decoration-none">
        ← Профиль
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Настройки
      </h1>

      <div className="d-flex flex-column gap-3">
        <div className="surface p-4" style={{ maxWidth: "32rem" }}>
          <h2 className="h6 fw-semibold mb-3">Профиль</h2>
          <form action={updateProfile} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label">Имя</label>
              <input name="name" defaultValue={user.name ?? ""} className="form-control" />
            </div>
            <FileDropzone name="photoUrl" label="Фото" defaultValue={user.photoUrl ?? ""} />
            <div>
              <p className="small fw-semibold mb-2">Приватность</p>
              <p className="small text-secondary mb-2">
                Друзья видят всё всегда; настройки ниже — для остальных.
              </p>
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="hideProfileActivity"
                  name="hideProfileActivity"
                  defaultChecked={user.hideProfileActivity}
                />
                <label className="form-check-label small" htmlFor="hideProfileActivity">
                  Скрыть всю активность
                  <span className="text-secondary d-block">
                    Не-друзья увидят только имя и фото.
                  </span>
                </label>
              </div>
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="hideAchievements"
                  name="hideAchievements"
                  defaultChecked={user.hideAchievements}
                />
                <label className="form-check-label small" htmlFor="hideAchievements">
                  Скрыть ачивки
                </label>
              </div>
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="hideFavoritePerformers"
                  name="hideFavoritePerformers"
                  defaultChecked={user.hideFavoritePerformers}
                />
                <label className="form-check-label small" htmlFor="hideFavoritePerformers">
                  Скрыть фан-профиль (любимых актёров)
                </label>
              </div>
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="hideVisitedPlaces"
                  name="hideVisitedPlaces"
                  defaultChecked={user.hideVisitedPlaces}
                />
                <label className="form-check-label small" htmlFor="hideVisitedPlaces">
                  Скрыть посещённые места
                </label>
              </div>
            </div>
            <button type="submit" className="btn btn-primary">
              Сохранить
            </button>
          </form>
        </div>

        <div className="surface p-4" style={{ maxWidth: "32rem" }}>
          <h2 className="h6 fw-semibold mb-3">Смена пароля</h2>
          <ChangePasswordForm />
        </div>

        <div className="surface p-4" style={{ maxWidth: "32rem" }}>
          <h2 className="h6 fw-semibold mb-3">Подписка на календарь</h2>
          <IcsFeedSection token={icsToken} />
        </div>
      </div>
    </div>
  );
}
