"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import EntitySelect, { type EntityOption } from "@/components/EntitySelect";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import FileDropzone from "@/components/FileDropzone";
import { createAgencyAndReturn } from "../agencies/actions";
import { createDramaAndReturn, searchDramaOptions } from "../dramas/actions";
import { searchEventOptions } from "../events/actions";
import { searchSoloPerformerOptions, searchMascotOwnerOptions } from "./actions";
import { createPerformerAndReturn, findSimilarPerformers } from "./actions";
import FormSection from "@/components/admin/FormSection";
import MdlRefreshButton from "./MdlRefreshButton";
import { BookIcon, EyeIcon, LinkIcon, MusicNoteIcon, UserIcon } from "@/components/icons";
import SubmitButton from "@/components/admin/SubmitButton";
import useUnsavedGuard from "@/components/admin/UnsavedGuard";
import DuplicateNameWarning from "@/components/DuplicateNameWarning";
import QuickCreateEventButton from "./QuickCreateEventButton";
import PairingManager from "./PairingManager";
import { detectSocialPlatform, type SocialPlatform } from "@/lib/socialLinks";
import DatePickerInput from "@/components/DatePickerInput";


export type PerformerLinkInput = {
  label: string;
  url: string;
  kind?: "OTHER" | "BRAND";
  /** Заголовок своего блока ссылок («Питомцы», «Кафе») — пусто у
   *  обычных ссылок и брендов. */
  group?: string | null;
};
export type PerformerOption = { id: string; name: string; photoUrl?: string | null };

type Tab = "general" | "dramas" | "events" | "pairing" | (string & {});

/** Вкладка, живущая ВНЕ формы профиля: у музыки свои server actions и
 *  своя кнопка сохранения, а вложенные <form> в HTML запрещены — так
 *  что панель рендерится соседом формы, а таб-бар общий. */
export type ExtraTab = { key: string; label: string; content: React.ReactNode };

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tab-bar-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function PerformerForm({
  action,
  submitLabel,
  soloPerformers,
  agencies,
  dramas,
  events,
  defaultValues,
  initialType,
  defaultMemberIds,
  mascotOwnerOptions,
  defaultMascotPerformerIds,
  defaultDramaIds,
  defaultEventIds,
  currentPairings,
  extraTabs = [],
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  /** Existing SOLO performers, for the pairing-partner select and the band-members picker. */
  soloPerformers: PerformerOption[];
  agencies: EntityOption[];
  dramas: EntityOption[];
  events: EntityOption[];
  /** Тип при СОЗДАНИИ — задаётся разделом, из которого пришли
   *  (?type= у /admin/performers/new): селекта типа в форме создания
   *  нет (правка владельца 2026-09-26). */
  initialType?: string;
  defaultValues?: {
    performerId: string;
    name: string;
    type: string;
    realName: string;
    musicAlias: string;
    alsoKnownAs: string;
    nationality: string;
    gender: string;
    birthDate: string;
    placeOfBirth: string;
    bio: string;
    agencyIds: string[];
    photoUrl: string;
    mydramalistUrl: string;
    /** Страница артиста на musicfestival.in.th (пишет краулер
     *  фестивалей; в форме только показывается). */
    musicFestivalUrl?: string | null;
    occupation?: string;
    instruments?: string;
    soloDebut?: string;
    height?: string;
    weight?: string;
    bloodType?: string;
    mbti?: string;
    signatureUrl?: string;
    mvAppearances?: string;
    /** Факты — по одному на строку. */
    trivia?: string;
    links: PerformerLinkInput[];
  };
  /** Pre-filled band member ids, for editing an existing BAND performer. */
  defaultMemberIds?: string[];
  /** Маскоты: варианты пейрингов (список короткий, грузится целиком) и
   *  уже привязанные владельцы (актёры/пейринги) для режима MASCOT. */
  mascotOwnerOptions?: EntityOption[];
  defaultMascotPerformerIds?: string[];
  defaultDramaIds?: string[];
  defaultEventIds?: string[];
  /** Existing pairings this performer is part of — edit mode only. */
  /** Строки менеджера пейрингов — форма их только прокидывает, состав
   *  полей держит PairingManager. */
  currentPairings?: React.ComponentProps<typeof PairingManager>["currentPairings"];
  /** Вкладки вне формы (см. ExtraTab) — сейчас это «Музыка». */
  extraTabs?: ExtraTab[];
}) {
  const uid = useId();
  const v = defaultValues;
  const isCreating = !v;
  const [nameValue, setNameValue] = useState(v?.name ?? "");

  const [type, setType] = useState(v?.type ?? initialType ?? "SOLO");

  const formRef = useRef<HTMLFormElement>(null);
  const { dirty } = useUnsavedGuard(formRef);
  // Какой раздел уходит на сервер. Пишем прямо в DOM, а не через
  // состояние: onClick срабатывает до отправки формы синхронно, а
  // setState к моменту submit мог бы ещё не примениться.
  const scopeRef = useRef<HTMLInputElement>(null);
  const setScope = useCallback(
    (scope: "all" | "general" | "dramas" | "events") => () => {
      if (scopeRef.current) scopeRef.current.value = scope;
    },
    [],
  );
  const [activeTab, setActiveTab] = useState<Tab>("general");

  /** Правки всех вкладок сохраняются одной кнопкой — при уходе на
   *  другую вкладку ничего не теряется, но пользователь должен видеть,
   *  что несохранённое есть. */
  function switchTab(next: Tab) {
    setActiveTab(next);
  }
  // Дорамы/Пейринг don't apply to bands — if the type switches to BAND while
  // one of those is active, fall back to "general" (derived, not stored, so
  // switching type doesn't leave every panel hidden for a render).
  const effectiveTab: Tab =
    type !== "SOLO" && (activeTab === "dramas" || activeTab === "pairing")
      ? "general"
      : activeTab;
  const activeExtra = extraTabs.find((t) => t.key === effectiveTab) ?? null;

  // Счётчики в подписях вкладок — сколько записей уже привязано в базе
  // (те же строки, что рисуются на вкладке; отдельного запроса нет).
  // Именно сохранённое, а не текущий выбор: мультиселекты
  // неконтролируемые, и до нажатия «Сохранить» число в базе не меняется.
  // При создании исполнителя привязок ещё нет — скобки не показываем,
  // чтобы не шуметь «(0)» на каждой вкладке.
  const tabCount = (n: number) => (isCreating ? "" : ` (${n})`);

  // Instagram/TikTok/Twitter get their own fields below (recognized by URL,
  // not label) — everything else stays in the free-form list.
  const socialDefaults: Partial<Record<SocialPlatform, string>> = {};
  const genericLinkDefaults: PerformerLinkInput[] = [];
  // Личные бренды живут своим списком: у них есть имя, и оно важнее
  // адреса, поэтому в соцсети их разбирать нельзя — даже если бренд
  // ведёт на инстаграм.
  const brandDefaults: PerformerLinkInput[] = [];
  // Ссылки своего блока («Питомцы», «Кафе») в соцсети не разбираем и в
  // общий список не кладём: у них своё место на странице.
  const groupedDefaults: PerformerLinkInput[] = [];
  for (const l of v?.links ?? []) {
    if (l.kind === "BRAND") {
      brandDefaults.push(l);
      continue;
    }
    if (l.group?.trim()) {
      groupedDefaults.push(l);
      continue;
    }
    const platform = detectSocialPlatform(l.url);
    if (platform && socialDefaults[platform] === undefined) {
      socialDefaults[platform] = l.url;
    } else {
      // Второй профиль той же сети НЕ перезаписывает поле, а падает в
      // общий список: раньше он был невидим в форме и молча удалялся
      // сохранением (deleteMany + пересоздание из формы) — задвоенную
      // ссылку нельзя было ни увидеть, ни удалить руками.
      genericLinkDefaults.push(l);
    }
  }

  const [links, setLinks] = useState<PerformerLinkInput[]>(
    genericLinkDefaults.length > 0 ? genericLinkDefaults : [{ label: "", url: "" }],
  );

  const [groupedLinks, setGroupedLinks] = useState<PerformerLinkInput[]>(groupedDefaults);

  function addGroupedLink() {
    // Новая строка наследует заголовок последней: блок обычно набирают
    // подряд («Питомцы»: кот, потом собака), и перепечатывать его
    // каждый раз — верный способ развести блок на два опечаткой.
    setGroupedLinks((prev) => [
      ...prev,
      { label: "", url: "", group: prev.at(-1)?.group ?? "" },
    ]);
  }

  function removeGroupedLink(index: number) {
    setGroupedLinks((prev) => prev.filter((_, i) => i !== index));
  }

  function updateGroupedLink(index: number, field: "label" | "url" | "group", value: string) {
    setGroupedLinks((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  }

  function addLink() {
    setLinks((prev) => [...prev, { label: "", url: "" }]);
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLink(index: number, field: "label" | "url", value: string) {
    setLinks((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  }

  // Бренды: пустой строки по умолчанию нет — блок обычно не нужен, и
  // пустая пара полей у каждого артиста только мозолила бы глаза.
  const [brands, setBrands] = useState<PerformerLinkInput[]>(brandDefaults);

  function addBrand() {
    setBrands((prev) => [...prev, { label: "", url: "", kind: "BRAND" }]);
  }

  function removeBrand(index: number) {
    setBrands((prev) => prev.filter((_, i) => i !== index));
  }

  function updateBrand(index: number, field: "label" | "url", value: string) {
    setBrands((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    );
  }

  // Solo performers created inline via the pairing-partner picker, merged in
  // so PairingManager's own picker sees them too.
  const [createdMembers, setCreatedMembers] = useState<PerformerOption[]>([]);
  const allSoloPerformers = useMemo(
    () => [...soloPerformers, ...createdMembers.filter((c) => !soloPerformers.some((p) => p.id === c.id))],
    [soloPerformers, createdMembers],
  );

  // --- Events picker (quick-create needs a modal, so it feeds
  // EntityMultiSelect via externalAdditions rather than onCreateNew) ---
  const [createdEvents, setCreatedEvents] = useState<EntityOption[]>([]);

  return (
    <div className="surface d-flex flex-column gap-3 p-4">
      <div className="tab-bar mb-1">
        <TabButton active={effectiveTab === "general"} onClick={() => switchTab("general")}>
          Общая инфа
        </TabButton>
        {type === "SOLO" && (
          <TabButton active={effectiveTab === "dramas"} onClick={() => switchTab("dramas")}>
            Сериалы{tabCount(defaultDramaIds?.length ?? 0)}
          </TabButton>
        )}
        <TabButton active={effectiveTab === "events"} onClick={() => switchTab("events")}>
          События{tabCount(defaultEventIds?.length ?? 0)}
        </TabButton>

        {type === "SOLO" && (
          <TabButton active={effectiveTab === "pairing"} onClick={() => switchTab("pairing")}>
            Пейринг{tabCount(currentPairings?.length ?? 0)}
          </TabButton>
        )}
        {extraTabs.map((t) => (
          <TabButton key={t.key} active={effectiveTab === t.key} onClick={() => switchTab(t.key)}>
            {t.label}
          </TabButton>
        ))}
      </div>

      <form
        ref={formRef}
        action={action}
        className="d-flex flex-column gap-3"
        style={{ display: activeExtra ? "none" : undefined }}
      >
      {/* Раздел, который сохраняем. При создании — всё сразу: записи
          ещё нет, и делить нечего. */}
      <input type="hidden" name="scope" ref={scopeRef} defaultValue="all" />

      {/* Every tab stays mounted (display:none when inactive) so uncontrolled
          fields like FileDropzone/EntitySelect don't lose their state when
          switching tabs. The display-toggle lives on this outer div with no
          other classes — Bootstrap's .d-flex etc. carry !important and would
          otherwise beat an inline display:none on the same element. */}
      <div style={{ display: effectiveTab === "general" ? undefined : "none" }}>
      {/* gap-2: между секциями хватает их рамок, широкие зазоры делали
          форму «резаной» (правка владельца 2026-09-26). */}
      <div className="d-flex flex-column gap-2">
        {/* Группы — по смыслу, а не по источнику импорта (правка
            владельца 2026-09-26: «профиль отдельно из-за импортов, но в
            админке мне это не важно»). Имя и фото / Личное / Карьера /
            О себе. Тип при создании задан разделом и не показывается. */}
        <FormSection title="Основное" icon={<UserIcon />} tone="violet">
        <div className="row g-3">
          {/* Поля — всё, что осталось от фото: колонка фото ровно по его
              ширине, без пустоты справа (правка владельца 2026-09-26). */}
          <div className="col-12 col-md">
            <div className="row g-2">
              <div className={isCreating ? "col-12" : "col-12 col-lg-8"}>
                <label className="form-label" htmlFor="performer-form-name">
                  {type === "BAND" ? "Название группы *" : type === "MASCOT" ? "Имя маскота *" : "Имя *"}
                </label>
                <input id="performer-form-name"
                  name="name"
                  required
                  defaultValue={v?.name}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="form-control"
                />
                {isCreating && (
                  <DuplicateNameWarning
                    value={nameValue}
                    checkAction={findSimilarPerformers}
                    editHrefBase="/admin/performers"
                  />
                )}
              </div>
              {isCreating ? (
                <input type="hidden" name="type" value={type} />
              ) : (
                <div className="col-12 col-lg-4">
                  <label className="form-label" htmlFor="performer-form-type">Тип</label>
                  <select id="performer-form-type"
                    name="type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="form-select"
                  >
                    <option value="SOLO">Соло</option>
                    <option value="BAND">Группа</option>
                    <option value="MASCOT">Маскот</option>
                  </select>
                </div>
              )}

              {type === "SOLO" && (
                <>
                  <div className="col-12 col-sm-6">
                    <label className="form-label" htmlFor="performer-form-realName">Настоящее имя</label>
                    <input id="performer-form-realName"
                      name="realName"
                      defaultValue={v?.realName}
                      placeholder="Если сценическое имя отличается"
                      className="form-control"
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label" htmlFor="performer-form-musicAlias">Музыкальный псевдоним</label>
                    <input id="performer-form-musicAlias"
                      name="musicAlias"
                      defaultValue={v?.musicAlias}
                      placeholder="Если поёт под другим именем"
                      className="form-control"
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label" htmlFor="performer-form-alsoKnownAs">Также известен как</label>
                    <input id="performer-form-alsoKnownAs"
                      name="alsoKnownAs"
                      defaultValue={v?.alsoKnownAs}
                      placeholder="Другие написания имени, через запятую"
                      className="form-control"
                    />
                  </div>
                  {/* Кто это: рождение, национальность, пол — рядом с
                      именами. Заодно колонка полей сравнялась с фото:
                      раньше под «Также известен как» была пустота
                      (правка владельца 2026-09-26). */}
                  <div className="col-12 col-sm-6 col-lg-4">
                    <label className="form-label" htmlFor="performer-form-birthDate">Дата рождения</label>
                    <DatePickerInput id="performer-form-birthDate" name="birthDate" defaultValue={v?.birthDate} yearsBack={100} yearsForward={0} />
                  </div>
                  <div className="col-12 col-sm-6 col-lg-8">
                    <label className="form-label" htmlFor="performer-form-placeOfBirth">Место рождения</label>
                    <input id="performer-form-placeOfBirth"
                      name="placeOfBirth"
                      defaultValue={v?.placeOfBirth}
                      placeholder="Bangkok, Thailand"
                      className="form-control"
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label" htmlFor="performer-form-nationality">Национальность</label>
                    <input id="performer-form-nationality"
                      name="nationality"
                      defaultValue={v?.nationality}
                      placeholder="Thai"
                      className="form-control"
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label" htmlFor="performer-form-gender">Пол</label>
                    <select id="performer-form-gender" name="gender" defaultValue={v?.gender ?? ""} className="form-select">
                      <option value="">Не указан</option>
                      <option value="Male">Мужской</option>
                      <option value="Female">Женский</option>
                    </select>
                  </div>
                </>
              )}

              {/* Состав группы — в «Основном», сразу под названием: для
                  группы это главное после имени (правка владельца
                  2026-09-26), и так рядом с фото нет пустоты. */}
              {type === "BAND" && (
                <div className="col-12">
                  <label className="form-label d-block" htmlFor="performer-form-memberIds">Участники группы</label>
                  <EntityMultiSelect id="performer-form-memberIds"
                    name="memberIds"
                    options={soloPerformers}
                    defaultSelectedIds={defaultMemberIds}
                    placeholder="Начните вводить имя участника…"
                    createLabel="Создать исполнителя"
                    emptyMessage="Нет соло-исполнителей, которых можно добавить как участников."
                    hrefKind="Performer"
                    selectedVariant="person"
                    searchOptions={searchSoloPerformerOptions}
                    onCreateNew={async (query) => {
                      const created = await createPerformerAndReturn(query);
                      return { id: created.id, name: created.name, photoUrl: null };
                    }}
                  />
                </div>
              )}

              {type === "MASCOT" && (
                <div className="col-12 col-sm-6">
                  <label className="form-label" htmlFor="performer-form-birthDate">День рождения маскота</label>
                  <DatePickerInput id="performer-form-birthDate" name="birthDate" defaultValue={v?.birthDate} yearsBack={100} yearsForward={0} />
                </div>
              )}
              {type === "MASCOT" && (
                <div className="col-12">
                  <label className="form-label d-block" htmlFor="performer-form-mascotPerformerIds">Чей маскот — актёры и группы</label>
                  <EntityMultiSelect id="performer-form-mascotPerformerIds"
                    name="mascotPerformerIds"
                    options={mascotOwnerOptions ?? []}
                    defaultSelectedIds={defaultMascotPerformerIds}
                    placeholder="Начните вводить имя актёра…"
                    hrefKind="Performer"
                    selectedVariant="person"
                    searchOptions={searchMascotOwnerOptions}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Фото — небольшое, с кадрированием. */}
          <div className="col-12 col-md-auto performer-photo-col">
            <FileDropzone name="photoUrl" label="Фото" defaultValue={v?.photoUrl} large recrop />
          </div>
        </div>
        </FormSection>


        {/* Внешность и характер — только у актёра: мерки, группа крови,
            MBTI и автограф справа. */}
        {type === "SOLO" && (
          <FormSection title="Внешность и характер" icon={<EyeIcon />} tone="purple">
          <div className="row g-3">
          {/* Два ряда по два поля — по высоте вровень с автографом справа
              (правка владельца 2026-09-26). */}
          <div className="col-12 col-md-7 col-lg-8">
          <div className="row g-2">
            <div className="col-6">
              <label className="form-label" htmlFor="performer-form-height">Рост</label>
              <input id="performer-form-height" name="height" defaultValue={v?.height} placeholder="175 cm" className="form-control" />
            </div>
            <div className="col-6">
              <label className="form-label" htmlFor="performer-form-weight">Вес</label>
              <input id="performer-form-weight" name="weight" defaultValue={v?.weight} placeholder="65 kg" className="form-control" />
            </div>
            <div className="col-6">
              <label className="form-label" htmlFor="performer-form-bloodType">Группа крови</label>
              <input id="performer-form-bloodType" name="bloodType" defaultValue={v?.bloodType} placeholder="O, A, B, AB" className="form-control" />
            </div>
            <div className="col-6">
              <label className="form-label" htmlFor="performer-form-mbti">MBTI</label>
              <input id="performer-form-mbti" name="mbti" defaultValue={v?.mbti} placeholder="INFP" className="form-control" />
            </div>
          </div>
          </div>
          <div className="col-12 col-md-5 col-lg-4">
            <FileDropzone name="signatureUrl" label="Автограф" defaultValue={v?.signatureUrl} wide />
          </div>
          </div>
          </FormSection>
        )}

        {/* Карьера: где работает и чем занимается. Маскоту не нужна. */}
        {type !== "MASCOT" && (
          <FormSection title="Карьера" icon={<MusicNoteIcon />} tone="magenta">
          <div className="row g-2">
            <div className="col-12">
              <label className="form-label d-block" htmlFor={`${uid}-agencyIds`}>Агентства</label>
              <EntityMultiSelect id={`${uid}-agencyIds`}
                name="agencyIds"
                options={agencies}
                defaultSelectedIds={v?.agencyIds}
                placeholder="Начните вводить название агентства…"
                createLabel="Создать агентство"
                hrefKind="Agency"
                onCreateNew={async (query) => {
                  const created = await createAgencyAndReturn(query);
                  return { id: created.id, name: created.name, photoUrl: created.logoUrl };
                }}
              />
            </div>
            {type === "SOLO" && (
              <>
                <div className="col-12 col-md-4">
                  <label className="form-label" htmlFor="performer-form-occupation">Занятия</label>
                  <input id="performer-form-occupation"
                    name="occupation"
                    defaultValue={v?.occupation}
                    placeholder="Singer, actor — через запятую"
                    className="form-control"
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label" htmlFor="performer-form-instruments">Инструменты</label>
                  <input id="performer-form-instruments"
                    name="instruments"
                    defaultValue={v?.instruments}
                    placeholder="Guitar, piano — через запятую"
                    className="form-control"
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label" htmlFor="performer-form-soloDebut">Сольный дебют</label>
                  <input id="performer-form-soloDebut"
                    name="soloDebut"
                    defaultValue={v?.soloDebut}
                    placeholder="August 9, 2023"
                    className="form-control"
                  />
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="performer-form-mvAppearances">Появления в клипах</label>
                  <textarea id="performer-form-mvAppearances"
                    name="mvAppearances"
                    rows={2}
                    defaultValue={v?.mvAppearances}
                    placeholder="По одному пункту на строку"
                    className="form-control"
                  />
                </div>
              </>
            )}
          </div>
          </FormSection>
        )}

        {/* О себе: биография и факты — оба про «что рассказать». Факты
            одним полем, по факту на строку; перевод — во вкладке
            «Перевод», по полю на каждый факт. */}
        <FormSection title={type === "BAND" ? "О группе" : "О себе"} icon={<BookIcon />} tone="rose">
          <div>
            <label className="form-label" htmlFor="performer-form-bio">{type === "BAND" ? "Описание" : "Биография"}</label>
            <textarea id="performer-form-bio"
              name="bio"
              rows={4}
              defaultValue={v?.bio}
              className="form-control"
            />
          </div>
          <div>
            <label className="form-label" htmlFor="performer-form-trivia">
              Факты <span className="fw-normal">— по одному на строку, перевод во вкладке «Перевод»</span>
            </label>
            <textarea
              id="performer-form-trivia"
              name="trivia"
              rows={6}
              defaultValue={v?.trivia}
              placeholder="Каждый факт — с новой строки"
              className="form-control"
            />
          </div>
        </FormSection>

        <FormSection title="Ссылки и соцсети" icon={<LinkIcon />} tone="indigo" hint="MyDramaList, соцсети, музыкальные площадки">
        <div>
          <label className="form-label" htmlFor="performer-form-mydramalistUrl">Ссылка на MyDramaList</label>
          {/* «Обновить инфу» — в одном ряду с полем: импорт с MDL вместе
              с сериалами (у новой записи ещё некуда писать — кнопки нет). */}
          <div className="d-flex flex-wrap align-items-center gap-2">
            <input id="performer-form-mydramalistUrl"
              type="url"
              name="mydramalistUrl"
              defaultValue={v?.mydramalistUrl}
              placeholder="https://mydramalist.com/…"
              className="form-control flex-grow-1 w-auto"
              style={{ minWidth: "14rem" }}
            />
            {v?.performerId && type === "SOLO" && (
              <MdlRefreshButton performerId={v.performerId} inputId="performer-form-mydramalistUrl" />
            )}
          </div>
        </div>
        {v?.musicFestivalUrl && (
          <p className="small text-secondary mb-0">
            Источник записи — страница артиста на{" "}
            <a href={v.musicFestivalUrl} target="_blank" rel="noopener noreferrer">
              musicfestival.in.th ↗
            </a>{" "}
            (проставлена краулером фестивалей, руками не правится).
          </p>
        )}

        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-instagramUrl">Instagram</label>
            <input id="performer-form-instagramUrl"
              type="url"
              name="instagramUrl"
              defaultValue={socialDefaults.instagram}
              placeholder="https://instagram.com/…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-tiktokUrl">TikTok</label>
            <input id="performer-form-tiktokUrl"
              type="url"
              name="tiktokUrl"
              defaultValue={socialDefaults.tiktok}
              placeholder="https://tiktok.com/@…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-twitterUrl">Twitter</label>
            <input id="performer-form-twitterUrl"
              type="url"
              name="twitterUrl"
              defaultValue={socialDefaults.twitter}
              placeholder="https://x.com/…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-facebookUrl">Facebook</label>
            <input id="performer-form-facebookUrl"
              type="url"
              name="facebookUrl"
              defaultValue={socialDefaults.facebook}
              placeholder="https://facebook.com/…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-spotifyUrl">Spotify</label>
            <input id="performer-form-spotifyUrl"
              type="url"
              name="spotifyUrl"
              defaultValue={socialDefaults.spotify}
              placeholder="https://open.spotify.com/artist/…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-applemusicUrl">Apple Music</label>
            <input id="performer-form-applemusicUrl"
              type="url"
              name="applemusicUrl"
              defaultValue={socialDefaults.applemusic}
              placeholder="https://music.apple.com/…"
              className="form-control"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label" htmlFor="performer-form-youtubeUrl">YouTube</label>
            <input id="performer-form-youtubeUrl"
              type="url"
              name="youtubeUrl"
              defaultValue={socialDefaults.youtube}
              placeholder="https://youtube.com/@…"
              className="form-control"
            />
          </div>
        </div>

        <div>
          <label className="form-label d-block" htmlFor="performer-form-linkLabel">Другие ссылки</label>
          <div className="d-flex flex-column gap-2">
            {links.map((link, i) => (
              <div key={i} className="row g-2 align-items-center">
                <div className="col-4">
                  <input id="performer-form-linkLabel"
                    type="text"
                    name="linkLabel"
                    placeholder="Название (Instagram, X…)"
                    value={link.label}
                    onChange={(e) => updateLink(i, "label", e.target.value)}
                    className="form-control"
                  />
                </div>
                <div className="col-7">
                  <input
                    type="url"
                    name="linkUrl"
                    placeholder="https://…"
                    value={link.url}
                    onChange={(e) => updateLink(i, "url", e.target.value)}
                    className="form-control"
                  />
                </div>
                <div className="col-1">
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => removeLink(i)}
                    aria-label="Удалить ссылку"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm mt-2"
            onClick={addLink}
          >
            + Добавить ссылку
          </button>
        </div>

        <div>
          {/* Заголовок группы, а не подпись поля: строк может не быть
              вовсе (у нового исполнителя их ноль), и htmlFor указывал бы
              в пустоту — см. tests/e2e/form-labels.spec.ts. Подписи несут
              сами поля через aria-label. */}
          <div className="form-label d-block">Личные бренды</div>
          <p className="text-secondary small mb-2">
            Своё дело артиста: марка одежды, кафе, косметика. Показывается
            отдельным блоком под описанием на странице артиста — название
            обязательно, без него строка не сохранится.
          </p>
          <div className="d-flex flex-column gap-2">
            {brands.map((brand, i) => (
              <div key={i} className="row g-2 align-items-center">
                <div className="col-4">
                  <input
                    type="text"
                    name="brandLabel"
                    placeholder="Название бренда"
                    value={brand.label}
                    onChange={(e) => updateBrand(i, "label", e.target.value)}
                    className="form-control"
                    aria-label="Название бренда"
                  />
                </div>
                <div className="col-7">
                  <input
                    type="url"
                    name="brandUrl"
                    placeholder="https://…"
                    value={brand.url}
                    onChange={(e) => updateBrand(i, "url", e.target.value)}
                    className="form-control"
                    aria-label="Ссылка на бренд"
                  />
                </div>
                <div className="col-1">
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => removeBrand(i)}
                    aria-label="Удалить бренд"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm mt-2"
            onClick={addBrand}
          >
            + Добавить бренд
          </button>
        </div>

        <div>
          {/* Заголовок группы, а не подпись поля: строк может не быть
              вовсе — см. соседний блок брендов. */}
          <div className="form-label d-block">Свои блоки ссылок</div>
          <p className="text-secondary small mb-2">
            Как бренды, только заголовок блока задаёте вы: «Питомцы» —
            инстаграмы кота и собаки, «Кафе» — заведение артиста. Строки
            с ОДИНАКОВЫМ заголовком собираются в один блок (регистр и
            лишние пробелы не в счёт). Без заголовка или без названия
            строка не сохранится.
          </p>
          <div className="d-flex flex-column gap-2">
            {groupedLinks.map((row, i) => (
              <div key={i} className="row g-2 align-items-center">
                <div className="col-3">
                  <input
                    type="text"
                    name="groupLinkGroup"
                    placeholder="Заголовок блока"
                    value={row.group ?? ""}
                    onChange={(e) => updateGroupedLink(i, "group", e.target.value)}
                    className="form-control"
                    aria-label="Заголовок блока ссылок"
                  />
                </div>
                <div className="col-3">
                  <input
                    type="text"
                    name="groupLinkLabel"
                    placeholder="Название ссылки"
                    value={row.label}
                    onChange={(e) => updateGroupedLink(i, "label", e.target.value)}
                    className="form-control"
                    aria-label="Название ссылки в блоке"
                  />
                </div>
                <div className="col-5">
                  <input
                    type="url"
                    name="groupLinkUrl"
                    placeholder="https://…"
                    value={row.url}
                    onChange={(e) => updateGroupedLink(i, "url", e.target.value)}
                    className="form-control"
                    aria-label="Адрес ссылки в блоке"
                  />
                </div>
                <div className="col-1">
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => removeGroupedLink(i)}
                    aria-label="Удалить ссылку блока"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm mt-2"
            onClick={addGroupedLink}
          >
            + Добавить ссылку в блок
          </button>
        </div>
        </FormSection>

      </div>
      </div>

      {type === "SOLO" && (
        <div style={{ display: effectiveTab === "dramas" ? undefined : "none" }}>
          <label className="form-label d-block" htmlFor="performer-form-dramaIds">Сериалы</label>
          <EntityMultiSelect id="performer-form-dramaIds"
            name="dramaIds"
            selectedVariant="card"
            options={dramas}
            defaultSelectedIds={defaultDramaIds}
            placeholder="Начните вводить название сериала…"
            createLabel="Создать сериал"
            hrefKind="Drama"
            searchOptions={searchDramaOptions}
            onCreateNew={async (query) => {
              const created = await createDramaAndReturn(query);
              return { id: created.id, name: created.title, photoUrl: created.posterUrl };
            }}
          />
          {!isCreating && (
            <div className="admin-form-actions">
              <SubmitButton
                label="Сохранить сериалы"
                busyLabel="Сохранение…"
                className="btn btn-primary"
                onClick={setScope("dramas")}
              />
              <span className="small text-secondary">Сохраняется только эта вкладка.</span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: effectiveTab === "events" ? undefined : "none" }}>
        <label className="form-label d-block" htmlFor="performer-form-eventIds">События</label>
        <EntityMultiSelect id="performer-form-eventIds"
          name="eventIds"
          selectedVariant="card"
          options={events}
          defaultSelectedIds={defaultEventIds}
          placeholder="Начните вводить название события…"
          externalAdditions={createdEvents}
          hrefKind="Event"
          searchOptions={searchEventOptions}
        />
        <QuickCreateEventButton
          onCreated={(event) => setCreatedEvents((prev) => [...prev, event])}
        />
        {!isCreating && (
          <div className="admin-form-actions">
            <SubmitButton
              label="Сохранить события"
              busyLabel="Сохранение…"
              className="btn btn-primary"
              onClick={setScope("events")}
            />
            <span className="small text-secondary">Сохраняется только эта вкладка.</span>
          </div>
        )}
      </div>

      {type === "SOLO" && (
        <div style={{ display: effectiveTab === "pairing" ? undefined : "none" }}>
          {isCreating ? (
            <>
              <label className="form-label d-block" htmlFor="performer-form-pairingPartnerId">Пейринг (необязательно)</label>
              <p className="small text-secondary mt-n1 mb-2">
                Сразу связать этого исполнителя в пару с уже существующим.
              </p>
              <div className="row g-2">
                <div className="col-12 col-sm-7">
                  <EntitySelect id="performer-form-pairingPartnerId"
                    name="pairingPartnerId"
                    options={allSoloPerformers}
                    placeholder="Не создавать пейринг"
                    createLabel="Создать исполнителя"
                    hrefKind="Performer"
                    searchOptions={searchSoloPerformerOptions}
                    onCreateNew={async (query) => {
                      const created = await createPerformerAndReturn(query);
                      setCreatedMembers((prev) => [...prev, { id: created.id, name: created.name }]);
                      return { id: created.id, name: created.name, photoUrl: null };
                    }}
                  />
                </div>
                <div className="col-12 col-sm-5">
                  <input
                    type="text"
                    name="pairingName"
                    placeholder="Название пейринга (необязательно)"
                    className="form-control"
                  />
                </div>
              </div>
            </>
          ) : v ? (
            <PairingManager
              performerId={v.performerId}
              currentPairings={currentPairings ?? []}
              soloPerformers={allSoloPerformers}
            />
          ) : null}
        </div>
      )}

      <div
        className="admin-form-actions"
        style={{ display: isCreating || effectiveTab === "general" ? undefined : "none" }}
      >
        <SubmitButton
          label={submitLabel}
          busyLabel="Сохранение…"
          className="btn btn-primary"
          onClick={setScope(isCreating ? "all" : "general")}
        />
        <span className="small text-secondary">
          {dirty
            ? "● Есть несохранённые изменения — они пропадут, если уйти со страницы."
            : isCreating
              ? "Всё, что заполнено на вкладках, сохранится вместе."
              : "Сериалы и события сохраняются своими кнопками на их вкладках."}
        </span>
      </div>
      </form>

      {extraTabs.map((t) => (
        <div key={t.key} style={{ display: effectiveTab === t.key ? undefined : "none" }}>
          {dirty && (
            <p className="admin-tab-warning small mb-3">
              ● В профиле есть несохранённые правки. Эта вкладка сохраняется
              отдельной кнопкой — вернитесь на вкладку профиля и нажмите
              «{submitLabel}», иначе правки профиля пропадут.
            </p>
          )}
          {t.content}
        </div>
      ))}
    </div>
  );
}
