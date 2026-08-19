"use client";

import { useRef, useState } from "react";

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
}: {
  name: string;
  defaultValue?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);

  function exec(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    setHtml(ref.current?.innerHTML ?? "");
  }

  async function insertImage(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) throw new Error("upload failed");
      const { url } = (await res.json()) as { url: string };
      exec(
        "insertHTML",
        `<img src="${url}" alt="" loading="lazy" decoding="async" style="max-width:100%;border-radius:0.5rem" />`,
      );
    } finally {
      setUploading(false);
    }
  }

  // Только данные (никаких замыканий с ref в рендере — правило
  // react-hooks/refs); обработчик один, ниже.
  const buttons: { key: string; label: React.ReactNode; title: string; cmd: string; arg?: string }[] = [
    { key: "h2", label: "H2", title: "Заголовок", cmd: "formatBlock", arg: "<h2>" },
    { key: "h3", label: "H3", title: "Подзаголовок", cmd: "formatBlock", arg: "<h3>" },
    { key: "p", label: "¶", title: "Обычный текст", cmd: "formatBlock", arg: "<p>" },
    { key: "b", label: <b>B</b>, title: "Жирный", cmd: "bold" },
    { key: "i", label: <i>I</i>, title: "Курсив", cmd: "italic" },
    { key: "u", label: <u>U</u>, title: "Подчёркнутый", cmd: "underline" },
    { key: "ul", label: "• Список", title: "Маркированный список", cmd: "insertUnorderedList" },
    { key: "ol", label: "1. Список", title: "Нумерованный список", cmd: "insertOrderedList" },
    { key: "link", label: "Ссылка", title: "Вставить ссылку", cmd: "createLink" },
    { key: "clear", label: "✕ Формат", title: "Очистить форматирование", cmd: "removeFormat" },
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
        {buttons.map((b) => (
          <button
            key={b.key}
            type="button"
            className="btn btn-ghost btn-sm"
            title={b.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runButton(b)}
          >
            {b.label}
          </button>
        ))}
        <label className="btn btn-ghost btn-sm mb-0" title="Вставить картинку">
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
            title={`Цвет текста ${c}`}
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
            title={`Фон ${c}`}
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
      <div
        ref={ref}
        className="form-control rich-editor"
        contentEditable
        suppressContentEditableWarning
        style={{ minHeight: "22rem", overflowY: "auto" }}
        onInput={() => setHtml(ref.current?.innerHTML ?? "")}
        dangerouslySetInnerHTML={{ __html: defaultValue }}
      />
    </div>
  );
}
