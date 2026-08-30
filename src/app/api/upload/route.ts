import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { isAdminAuthenticated } from "@/lib/auth";
import { getCurrentUser } from "@/lib/userAuth";
import { toWebp, writeWebpVariants } from "@/lib/localImage";
import { allowedFormats, type UploadErrorBody } from "@/lib/uploadErrors";

const MAX_MB = 8;
const MAX_SIZE = MAX_MB * 1024 * 1024;

// Сколько файлов принимаем в ОДНОМ запросе. Три — потому что больше
// трёх за раз шлёт только EventPhotosField (лимит фото события,
// EVENT_PHOTOS_MAX там же), остальные поля грузят по одному. Серверный
// потолок нужен, чтобы клиентскую проверку нельзя было обойти и
// навалить сирот одной пачкой.
const MAX_FILES_PER_REQUEST = 3;

// --- Мини-лимитер загрузок (fixed window, in-memory) -------------------
// Образец — src/lib/rateLimit.ts (логин/регистрация), но копия своя:
// ключ здесь userId (загрузка и так только для залогиненных), считаем
// файлы, а не попытки. Процесс один (single-container deploy), поэтому
// память вместо внешнего стора; окна чистятся при каждом обращении.
// Смысл: каждый загруженный файл до сабмита формы — потенциальный
// сирота на диске, и без потолка их можно лить гигабайтами.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_FILES = 30;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

function takeUploadQuota(key: string, files: number): boolean {
  const now = Date.now();
  for (const [k, w] of rateWindows) {
    if (w.resetAt <= now) rateWindows.delete(k);
  }
  const w = rateWindows.get(key);
  if (!w || w.resetAt <= now) {
    rateWindows.set(key, { count: files, resetAt: now + RATE_WINDOW_MS });
    return files <= RATE_MAX_FILES;
  }
  w.count += files;
  return w.count <= RATE_MAX_FILES;
}

// Allowlist only — no image/svg+xml, which can carry an executable <script>
// and would be served back verbatim as a static file from /public/uploads.
// JPEG/PNG/WebP get re-encoded to WebP on save (toWebp); GIFs are kept
// as-is to preserve animation.
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  // Брони отелей и билеты чаще всего приходят PDF-файлом. В WebP их,
  // разумеется, не конвертируем — сохраняем как есть.
  "application/pdf": ".pdf",
};

// Текст ошибки собирает клиент: язык страницы сюда не доходит — её
// дёргают по адресу без языкового префикса. См. src/lib/uploadErrors.ts.
// Коды вне UploadErrorCode (RATE_LIMITED, TOO_MANY_FILES) клиент
// показывает общей фразой — это предусмотрено в uploadErrorMessage.
const fail = (body: UploadErrorBody, status: number) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  const [isAdmin, user] = await Promise.all([isAdminAuthenticated(), getCurrentUser()]);
  if (!isAdmin && !user) {
    return fail({ error: "NOT_AUTHORIZED" }, 401);
  }

  const formData = await request.formData();
  // Принимаем и одиночный файл (все старые поля), и пачку (фото
  // события): ответ для одиночного не изменился ({ url }), пачка
  // дополнительно получает urls.
  const files = formData.getAll("file").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return fail({ error: "NO_FILE" }, 400);
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ error: "TOO_MANY_FILES", max: MAX_FILES_PER_REQUEST }, { status: 400 });
  }
  if (!takeUploadQuota(user?.id ?? "admin", files.length)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // Сначала валидируем и конвертируем ВСЕ файлы, и только потом пишем
  // на диск: ошибка в третьем файле пачки не должна оставить первые два
  // сиротами.
  const converted: { buffer: Buffer; ext: string }[] = [];
  for (const file of files) {
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return fail({ error: "BAD_TYPE", formats: allowedFormats(ALLOWED_TYPES) }, 400);
    }
    if (file.size > MAX_SIZE) {
      return fail({ error: "TOO_LARGE", maxMb: MAX_MB }, 400);
    }

    const raw = Buffer.from(await file.arrayBuffer());
    if (file.type === "application/pdf") {
      converted.push({ buffer: raw, ext: ".pdf" });
    } else {
      try {
        converted.push(await toWebp(raw, file.type));
      } catch {
        // Битый/не читающийся файл — не сохраняем что попало.
        return fail({ error: "BAD_IMAGE" }, 400);
      }
    }
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const urls: string[] = [];
  for (const { buffer, ext } of converted) {
    const filename = `${randomUUID()}${ext}`;
    await writeFile(path.join(uploadsDir, filename), buffer);
    await writeWebpVariants(uploadsDir, filename, buffer);
    urls.push(`/uploads/${filename}`);
  }

  return NextResponse.json({ url: urls[0], urls });
}
