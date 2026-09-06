"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/components/LocaleProvider";

/** Пропорции кадра — те же, в которых фото профиля и показывается:
 *  вертикальная карточка 3:4 со скруглением (`.profile-side-photo`).
 *  Круглой рамки здесь нет намеренно (правка владельца 2026-09-06):
 *  круглые только мелкие аватарки в шапке и списках, а они вырезают
 *  середину этого же кадра сами. */
const RATIO_W = 3;
const RATIO_H = 4;
/** Потолок ДЛИННОЙ стороны итогового файла. Больше не нужно: крупнее
 *  фото нигде не показывается, а лишние пиксели — вес файла и время
 *  загрузки с телефона. Меньше исходника не растягиваем (см. apply). */
const MAX_OUTPUT = 1024;
/** Верхняя граница ползунка: во сколько раз можно приблизить картинку
 *  относительно «вписать по короткой стороне». Четырёх хватает, чтобы
 *  вырезать лицо из общего плана, и при этом нельзя увеличить до каши. */
const MAX_ZOOM = 4;
/** Качество WebP. 0.9 визуально неотличимо от исходника на аватарке. */
const OUTPUT_QUALITY = 0.9;

type Offset = { x: number; y: number };

/**
 * Кадрирование СВОЕЙ фотографии перед отправкой на сервер.
 *
 * Зачем: карточка профиля вертикальная (3:4), а снимки приходят какие
 * угодно — без кропа человек не управляет тем, что в неё попадёт, и
 * голова уезжает за край. Здесь он двигает и приближает картинку в
 * рамке ровно тех пропорций, в которых фото и будет показано, а наверх
 * уходит уже готовый кадр.
 *
 * Всё считается сами, без библиотеки кропа: canvas + pointer events
 * закрывают и мышь, и палец, а новая зависимость ради одного окна
 * дороже сорока строк арифметики.
 *
 * Анимация GIF при кадрировании теряется — сознательно: предпросмотр
 * обязан показывать ровно то, что уедет на сервер, а покадровый кроп
 * гифки того не стоит.
 */
export default function ImageCropDialog({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (cropped: File) => void;
}) {
  const t = useT();
  const c = t.widgets.crop;

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  /** Ширина рамки в CSS-пикселях; высота — из пропорций. Рамка
   *  резиновая (на телефоне уже, чем на десктопе), а вся арифметика
   *  ниже — в её пикселях, поэтому размер нужен состоянием. */
  const [frame, setFrame] = useState(0);
  const frameH = (frame * RATIO_H) / RATIO_W;
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Живые указатели: одним таскаем, двумя — щипок. Ref, а не state:
  // на каждое движение пальца перерисовывать компонент незачем.
  const pointers = useRef(new Map<number, Offset>());

  // Картинку читаем через object URL: FileReader с data:-строкой на
  // 8-мегабайтном снимке заметно дольше и держит копию в памяти.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // Флаг «эта попытка уже неактуальна»: в dev React монтирует эффекты
    // дважды, и первая попытка получает revokeObjectURL раньше загрузки —
    // её onerror показывал бы «не удалось обработать» поверх нормально
    // открывшейся второй.
    let dropped = false;
    img.onload = () => {
      if (dropped) return;
      imageRef.current = img;
      setIsReady(true);
    };
    img.onerror = () => {
      if (!dropped) setFailed(true);
    };
    img.src = url;
    return () => {
      dropped = true;
      URL.revokeObjectURL(url);
      imageRef.current = null;
    };
  }, [file]);

  // Размер рамки меряем, а не задаём числом: ширину ей даёт CSS
  // (max-width плюс ширина модалки), и на повороте телефона она
  // меняется.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrame(el.clientWidth));
    ro.observe(el);
    setFrame(el.clientWidth);
    return () => ro.disconnect();
  }, [isReady]);

  /** Масштаб «накрыть рамку целиком»: при zoom=1 картинка ровно
   *  закрывает кадр, и дырок по краям не бывает ни при каком сдвиге.
   *  Считается по ОБЕИМ сторонам — у вертикальной рамки и вертикального
   *  снимка узкое место разное. */
  const baseScale = useCallback(() => {
    const img = imageRef.current;
    if (!img || !frame) return 1;
    return Math.max(frame / img.naturalWidth, frameH / img.naturalHeight);
  }, [frame, frameH]);

  /** Не даём утащить картинку за край рамки: смещение зажимаем так,
   *  чтобы рамка всегда была полностью накрыта. */
  const clamp = useCallback(
    (next: Offset, z: number): Offset => {
      const img = imageRef.current;
      if (!img || !frame) return next;
      const s = baseScale() * z;
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      return {
        x: Math.min(0, Math.max(frame - w, next.x)),
        y: Math.min(0, Math.max(frameH - h, next.y)),
      };
    },
    [baseScale, frame, frameH],
  );

  // Первая укладка (и пересчёт, если рамка сменила размер): картинка по
  // центру, масштаб — единица.
  useEffect(() => {
    const img = imageRef.current;
    if (!img || !frame) return;
    const s = baseScale();
    setZoom(1);
    setOffset({
      x: (frame - img.naturalWidth * s) / 2,
      y: (frameH - img.naturalHeight * s) / 2,
    });
  }, [baseScale, frame, frameH, isReady]);

  // Отрисовка предпросмотра. Канва в честных пикселях экрана
  // (devicePixelRatio), иначе на ретине лицо в рамке заметно мылит.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !frame) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(frame * dpr);
    canvas.height = Math.round(frameH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, frame, frameH);
    const s = baseScale() * zoom;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, offset.x, offset.y, img.naturalWidth * s, img.naturalHeight * s);
  }, [baseScale, frame, frameH, isReady, offset, zoom]);

  /** Масштабирование ВОКРУГ точки (центра рамки для ползунка, пальцев
   *  для щипка): без этого приближение всегда тянет к левому верхнему
   *  углу и кадр приходится ловить заново. */
  const zoomAround = useCallback(
    (nextZoom: number, px: number, py: number) => {
      const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
      setZoom(z);
      setOffset((prev) => {
        const k = z / zoom;
        return clamp({ x: px - (px - prev.x) * k, y: py - (py - prev.y) * k }, z);
      });
    },
    [clamp, zoom],
  );

  /** Расстояние и середина между двумя указателями — для щипка. */
  function pinchOf(list: Offset[]) {
    const [a, b] = list;
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  }

  function localPoint(e: React.PointerEvent): Offset {
    const rect = stageRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  function handlePointerDown(e: React.PointerEvent) {
    // Захват указателя: палец/мышь может уехать за пределы рамки, и без
    // него перетаскивание обрывается на середине жеста.
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, localPoint(e));
    setIsDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = localPoint(e);
    const before = [...pointers.current.values()];
    pointers.current.set(e.pointerId, now);

    if (pointers.current.size >= 2) {
      const after = [...pointers.current.values()];
      const p0 = pinchOf(before.slice(0, 2));
      const p1 = pinchOf(after.slice(0, 2));
      if (p0.dist > 0) zoomAround(zoom * (p1.dist / p0.dist), p1.cx, p1.cy);
      return;
    }
    setOffset((o) => clamp({ x: o.x + (now.x - prev.x), y: o.y + (now.y - prev.y) }, zoom));
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setIsDragging(false);
  }

  // Колесо мыши — тем же приближением, что и ползунок. Слушатель
  // вешаем руками: React ставит wheel пассивным, и preventDefault там
  // не работает — страница уезжала бы вместе с масштабом.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !isReady) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      zoomAround(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - rect.left, e.clientY - rect.top);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isReady, zoom, zoomAround]);

  async function apply() {
    const img = imageRef.current;
    if (!img || !frame) return;
    setIsBusy(true);
    try {
      const s = baseScale() * zoom;
      // Что попало в рамку — в координатах ИСХОДНОГО файла.
      const srcW = frame / s;
      const srcH = frameH / s;
      // Вверх не растягиваем: если в рамку попал кусок меньше потолка,
      // растянутый кадр — те же пиксели, только тяжелее.
      const outH = Math.max(1, Math.round(Math.min(MAX_OUTPUT, srcH)));
      const outW = Math.max(1, Math.round((outH * RATIO_W) / RATIO_H));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, -offset.x / s, -offset.y / s, srcW, srcH, 0, 0, outW, outH);
      const blob = await new Promise<Blob | null>((resolve) =>
        // WebP — тот же формат, в который /api/upload всё равно
        // пережимает картинку. Браузер, который его не умеет, отдаст
        // PNG: он тоже в allowlist ручки, так что мимо не пройдёт.
        canvas.toBlob(resolve, "image/webp", OUTPUT_QUALITY),
      );
      if (!blob) {
        setFailed(true);
        return;
      }
      const ext = blob.type === "image/png" ? "png" : "webp";
      onDone(new File([blob], `photo.${ext}`, { type: blob.type }));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Modal open onClose={onCancel} title={c.title}>
      <div className="image-crop">
        <p className="small text-secondary mb-0">{c.hint}</p>

        <div
          ref={stageRef}
          className={`image-crop-stage ${isDragging ? "is-dragging" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <canvas ref={canvasRef} aria-label={c.preview} role="img" />
          <span className="image-crop-ring" aria-hidden="true" />
        </div>

        <div className="image-crop-zoom">
          <label className="form-label small text-secondary mb-0" htmlFor="image-crop-zoom">
            {c.zoom}
          </label>
          <input
            id="image-crop-zoom"
            type="range"
            className="form-range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!isReady}
            onChange={(e) => zoomAround(Number(e.target.value), frame / 2, frameH / 2)}
          />
        </div>

        {failed && <p className="small text-danger mb-0">{c.failed}</p>}

        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={apply} disabled={!isReady || isBusy || failed}>
            {isBusy ? c.applying : c.apply}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t.common.cancel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
