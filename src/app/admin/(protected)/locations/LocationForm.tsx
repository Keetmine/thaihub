"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import FileDropzone from "@/components/FileDropzone";
import FormSection from "@/components/admin/FormSection";
import SubmitButton from "@/components/admin/SubmitButton";
import useUnsavedGuard from "@/components/admin/UnsavedGuard";
import { LOCATION_CATEGORIES } from "@/lib/locationCategories";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import { searchDramaOptions } from "../dramas/actions";

// Leaflet touches the DOM on mount, so it can't be part of the server-
// rendered HTML — load it client-only.
const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div
      className="surface d-flex align-items-center justify-content-center text-secondary small"
      style={{ height: "18rem" }}
    >
      Загрузка карты…
    </div>
  ),
});

export default function LocationForm({
  action,
  submitLabel,
  defaultValues,
  dramas,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  defaultValues?: {
    name: string;
    description: string;
    photoUrl: string;
    latitude: number | null;
    longitude: number | null;
    category: string | null;
    links: { label: string; url: string }[];
    dramaIds: string[];
  };
  /** Уже связанные сериалы — чтобы селект показал текущий выбор без
   *  загрузки всего каталога (их тысячи, ищем по мере ввода). */
  dramas?: { id: string; name: string; photoUrl?: string | null }[];
}) {
  const v = defaultValues;
  // Координаты держим здесь и отправляем скрытыми полями: карта
  // подгружается клиентски, и сохранение до её монтажа раньше стирало
  // уже проставленные координаты (полей просто не было в форме).
  const [links, setLinks] = useState<{ label: string; url: string }[]>(
    v?.links?.length ? v.links : [],
  );

  function updateLink(index: number, field: "label" | "url", value: string) {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  const [lat, setLat] = useState<number | null>(v?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(v?.longitude ?? null);

  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useUnsavedGuard(formRef);

  return (
    <form ref={formRef} action={action} className="surface d-flex flex-column gap-3 p-4">
      <FormSection title="Основное" hint="название, категория, описание, фото">
      <div className="row g-3">
        <div className="col-12 col-md-8">
          <label className="form-label" htmlFor="location-form-name">Название *</label>
          <input id="location-form-name" name="name" required defaultValue={v?.name} className="form-control" />
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label" htmlFor="location-form-category">Категория</label>
          {/* По категории строятся фильтры в списках мест и значки на
              карточках — свободный текст превратился бы в кашу из
              синонимов, поэтому выбор из списка. */}
          <select id="location-form-category" name="category" defaultValue={v?.category ?? ""} className="form-select">
            <option value="">не указана</option>
            {LOCATION_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-md-8">
          <label className="form-label" htmlFor="location-form-description">Описание</label>
          <textarea id="location-form-description"
            name="description"
            rows={5}
            defaultValue={v?.description}
            className="form-control"
          />
        </div>
        <div className="col-12 col-md-4">
          <FileDropzone name="photoUrl" label="Фото" defaultValue={v?.photoUrl} compact />
        </div>
      </div>
      </FormSection>

      <FormSection title="Координаты" hint="точка на карте">
        <input type="hidden" name="latitude" value={lat ?? ""} />
        <input type="hidden" name="longitude" value={lng ?? ""} />
        <LocationPicker
          defaultLatitude={v?.latitude}
          defaultLongitude={v?.longitude}
          onChange={(nextLat, nextLng) => {
            setLat(nextLat);
            setLng(nextLng);
          }}
        />
      </FormSection>

      {/* Сериалы, которые здесь снимали: без этой связи локация не
          появляется ни на странице сериала, ни в группировке «по
          сериалам» — раньше связать их можно было только из формы
          сериала. */}
      <FormSection title="Сериалы, снятые здесь" hint="связь с каталогом сериалов">
        <EntityMultiSelect
          name="dramaIds"
          options={dramas ?? []}
          defaultSelectedIds={v?.dramaIds}
          placeholder="Начните вводить название сериала…"
          hrefKind="Drama"
          searchOptions={searchDramaOptions}
        />
      </FormSection>

      {/* Ссылки: инстаграм заведения, сайт, канал — фандом чаще всего
          находит места именно по инстаграму. */}
      <FormSection title="Ссылки" hint="инстаграм заведения, сайт, канал">
        <div>
        {links.map((link, i) => (
          <div key={i} className="row g-2 mb-2">
            <div className="col-12 col-md-4">
              <input
                name="linkLabel"
                value={link.label}
                onChange={(e) => updateLink(i, "label", e.target.value)}
                placeholder="Instagram, сайт…"
                className="form-control form-control-sm"
              />
            </div>
            <div className="col-12 col-md-7">
              <input
                name="linkUrl"
                value={link.url}
                onChange={(e) => updateLink(i, "url", e.target.value)}
                placeholder="https://"
                className="form-control form-control-sm"
              />
            </div>
            <div className="col-12 col-md-1">
              <button
                type="button"
                className="btn btn-ghost btn-sm w-100"
                onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setLinks((prev) => [...prev, { label: "", url: "" }])}
        >
          + Добавить ссылку
        </button>
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
