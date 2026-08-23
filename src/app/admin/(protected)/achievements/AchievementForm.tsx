"use client";

import { useRef, useState } from "react";
import FormSection from "@/components/admin/FormSection";
import SubmitButton from "@/components/admin/SubmitButton";
import useUnsavedGuard from "@/components/admin/UnsavedGuard";

// Форма ачивки (Э2ф). Метрики приходят с сервера готовым списком
// (значение + русская подпись + kind): сам реестр METRICS живёт в
// src/lib/achievements.ts, который тянет prisma и в клиентский бандл
// не попадает. У флаговых метрик порога нет — поле блокируется на 1.

export type MetricOption = { value: string; label: string; kind: "counter" | "flag" };

export default function AchievementForm({
  action,
  submitLabel,
  metricOptions,
  defaultValues,
  keyLocked = false,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  metricOptions: MetricOption[];
  defaultValues?: {
    key: string;
    emoji: string;
    title: string;
    hint: string;
    metric: string;
    threshold: number;
    enabled: boolean;
    sort: number;
  };
  /** true на редактировании: по key привязаны уже полученные
   *  UserAchievement, менять его нельзя. */
  keyLocked?: boolean;
}) {
  const v = defaultValues;
  const [metric, setMetric] = useState(v?.metric ?? metricOptions[0]?.value ?? "");
  const isFlag = metricOptions.find((m) => m.value === metric)?.kind === "flag";

  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useUnsavedGuard(formRef);

  return (
    <form ref={formRef} action={action} className="surface d-flex flex-column gap-3 p-4">
      <FormSection title="Как выглядит" hint="эмодзи-медаль, название и подсказка «как получить»">
        <div className="row g-3">
          <div className="col-4 col-md-2">
            <label className="form-label">Эмодзи *</label>
            <input name="emoji" required defaultValue={v?.emoji} className="form-control" maxLength={8} />
          </div>
          <div className="col-8 col-md-4">
            <label className="form-label">Название *</label>
            <input name="title" required defaultValue={v?.title} className="form-control" />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label">Подсказка *</label>
            <input
              name="hint"
              required
              defaultValue={v?.hint}
              className="form-control"
              placeholder="Посетить 5 событий"
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Условие"
        hint="метрика считается кодом из статистики юзера, порог задаётся здесь"
      >
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label">Метрика *</label>
            <select
              name="metric"
              className="form-select"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {metricOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label">Порог *</label>
            {/* У флага порога нет: value=1 отправляется скрытым полем,
                видимый input задизейблен, чтобы это было очевидно. */}
            <input
              name={isFlag ? undefined : "threshold"}
              type="number"
              min={1}
              step={1}
              required
              key={isFlag ? "flag" : "counter"}
              defaultValue={isFlag ? 1 : v?.threshold ?? 1}
              disabled={isFlag}
              className="form-control"
            />
            {isFlag && <input type="hidden" name="threshold" value="1" />}
            {isFlag && (
              <div className="form-text">У флага порога нет — «было/не было».</div>
            )}
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label">Порядок</label>
            <input
              name="sort"
              type="number"
              step={1}
              defaultValue={v?.sort ?? 0}
              className="form-control"
            />
            <div className="form-text">Меньше — выше в списке.</div>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Служебное"
        hint="ключ связывает ачивку с уже полученными у пользователей"
      >
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-6">
            <label className="form-label">Ключ *</label>
            <input
              name="key"
              required
              defaultValue={v?.key}
              readOnly={keyLocked}
              pattern="[a-z0-9-]+"
              className="form-control"
              placeholder="concerts-5"
            />
            <div className="form-text">
              {keyLocked
                ? "Менять нельзя: по ключу привязаны уже полученные ачивки."
                : "Латиница в нижнем регистре, цифры и дефисы. После создания не меняется."}
            </div>
          </div>
          <div className="col-12 col-md-6">
            <div className="form-check">
              <input
                type="checkbox"
                name="enabled"
                id="achv-enabled"
                className="form-check-input"
                defaultChecked={v?.enabled ?? true}
              />
              <label htmlFor="achv-enabled" className="form-check-label">
                Включена
              </label>
            </div>
            <div className="form-text">
              Выключенная прячется отовсюду (кабинет, профили), прогресс не считается;
              уже полученные у пользователей записи остаются.
            </div>
          </div>
        </div>
      </FormSection>

      <div className="admin-form-actions">
        <SubmitButton label={submitLabel} busyLabel="Сохранение…" className="btn btn-primary" />
        {dirty && (
          <span className="small text-secondary">
            ● Есть несохранённые изменения — они пропадут, если уйти со страницы.
          </span>
        )}
      </div>
    </form>
  );
}
