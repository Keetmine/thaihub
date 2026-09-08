"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/LocaleProvider";
import { uploadErrorMessage } from "@/lib/uploadErrors";

// Мини-редактор для вики-статей: contenteditable + document.execCommand
// (deprecated, но повсеместно работает и не тянет зависимостей).
// Возможности: заголовки, жирный/курсив/подчёркнутый, списки, цвет
// текста и фон-выделение, ссылка, картинка (через /api/upload), очистка
// форматирования. HTML уходит в hidden-инпут `name`.

const TEXT_COLORS = ["#f2f0ee", "#ff6a3d", "#56d364", "#79b8ff", "#f9a950", "#ff5d6c"];
const HIGHLIGHTS = ["transparent", "#2a160e", "#0e2a16", "#0e1c2a"];

export default function RichTextEditor({
  name,
  defaultValue = "",
  labelledBy,
}: {
  name: string;
  defaultValue?: string;
  /** id подписи рядом. Не htmlFor: поле здесь — contentEditable-div, а
   *  <label for> действует только на настоящие поля формы. Скринридеру
   *  нужны и роль, и имя — отсюда role="textbox" ниже. */
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  const [html, setHtml] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function exec(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    setHtml(ref.current?.innerHTML ?? "");
  }

  async function insertImage(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      // Ручка отдаёт машинный код ошибки — фразу подбирает общий разбор,
      // как в FileDropzone (раньше тут был голый throw, и слишком большой
      // файл выглядел как «кнопка не сработала», без единого слова).
      if (!res.ok) {
        setUploadError(uploadErrorMessage(t, data, t.widgets.file.failed));
        return;
      }
      const { url } = data as { url: string };
      exec(
        "insertHTML",
        `<img src="${url}" alt="" loading="lazy" decoding="async" style="max-width:100%;border-radius:0.5rem" />`,
      );
    } catch {
      // Сеть оборвалась или ответ не JSON — причину не знаем.
      setUploadError(t.widgets.file.failed);
    } finally {
      setUploading(false);
    }
  }

  // Только данные (никаких замыканий с ref в рендере — правило
  // react-hooks/refs); обработчик один, ниже.
  const buttons: { key: string; label: React.ReactNode; tip: string; cmd: string; arg?: string }[] = [
    { key: "h2", label: "H2", tip: "Заголовок", cmd: "formatBlock", arg: "<h2>" },
    { key: "h3", label: "H3", tip: "Подзаголовок", cmd: "formatBlock", arg: "<h3>" },
    { key: "p", label: "¶", tip: "Обычный текст", cmd: "formatBlock", arg: "<p>" },
    { key: "b", label: <b>B</b>, tip: "Жирный", cmd: "bold" },
    { key: "i", label: <i>I</i>, tip: "Курсив", cmd: "italic" },
    { key: "u", label: <u>U</u>, tip: "Подчёркнутый", cmd: "underline" },
    { key: "ul", label: "• Список", tip: "Маркированный список", cmd: "insertUnorderedList" },
    { key: "ol", label: "1. Список", tip: "Нумерованный список", cmd: "insertOrderedList" },
    { key: "link", label: "Ссылка", tip: "Вставить ссылку", cmd: "createLink" },
    { key: "clear", label: "✕ Формат", tip: "Очистить форматирование", cmd: "removeFormat" },
  ];

  function runButton(b: (typeof buttons)[number]) {
    if (b.cmd === "createLink") {
      const url = window.prompt("Ссылка (https://…):");
      if (url) exec("createLink", url);
      return;
    }
    exec(b.cmd, b.arg);
  }

  return (
    <div>
      <input type="hidden" name={name} value={html} />
      <div className="d-flex flex-wrap gap-1 mb-2">
        {/* Подсказки — через data-tooltip, а не браузерный title (АА5):
            title нигде на сайте не стилизован и не показывается с
            клавиатуры, общий тултип умеет и то и другое. */}
        {buttons.map((b) => (
          <button
            key={b.key}
            type="button"
            className="btn btn-ghost btn-sm"
            data-tooltip={b.tip}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runButton(b)}
          >
            {b.label}
          </button>
        ))}
        <label className="btn btn-ghost btn-sm mb-0" data-tooltip="Вставить картинку">
          {uploading ? "Загрузка…" : "Картинка"}
          <input
            type="file"
            accept="image/*"
            className="d-none"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) insertImage(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="d-flex flex-wrap align-items-center gap-1 mb-2">
        <span className="small text-secondary me-1">Цвет:</span>
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            // У кружка нет текста — aria-label даёт имя читалке, тултип
            // дублирует его глазам (title не делал толком ни того, ни
            // другого).
            aria-label={`Цвет текста ${c}`}
            data-tooltip={`Цвет текста ${c}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("foreColor", c)}
            style={{
              width: "1.4rem",
              height: "1.4rem",
              borderRadius: "50%",
              background: c,
              border: "1px solid var(--bs-border-color)",
            }}
          />
        ))}
        <span className="small text-secondary ms-2 me-1">Фон:</span>
        {HIGHLIGHTS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Фон ${c}`}
            data-tooltip={`Фон ${c}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("hiliteColor", c)}
            style={{
              width: "1.4rem",
              height: "1.4rem",
              borderRadius: "0.35rem",
              background: c === "transparent" ? "var(--bs-secondary-bg)" : c,
              border: "1px solid var(--bs-border-color)",
            }}
          />
        ))}
      </div>
      {uploadError && <p className="small text-danger mb-2">{uploadError}</p>}
      <div
        ref={ref}
        className="form-control rich-editor"
        role="textbox"
        aria-multiline
        aria-labelledby={labelledBy}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        style={{ minHeight: "22rem", overflowY: "auto" }}
        onInput={() => setHtml(ref.current?.innerHTML ?? "")}
        dangerouslySetInnerHTML={{ __html: defaultValue }}
      />
    </div>
  );
}
