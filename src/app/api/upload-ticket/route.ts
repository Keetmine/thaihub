import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/userAuth";
import { privateUploadsDir } from "@/lib/privateUploads";
import { allowedFormats, type UploadErrorBody } from "@/lib/uploadErrors";

const MAX_MB = 10;
const MAX_SIZE = MAX_MB * 1024 * 1024;

// --- Мини-лимитер загрузок (fixed window, in-memory) -------------------
// Образец — src/lib/rateLimit.ts (там IP и попытки логина, здесь userId
// и файлы; копия в каждой upload-ручке, потому что из route.ts ничего,
// кроме хендлеров, экспортировать нельзя). Каждый загруженный до
// сабмита формы файл — потенциальный сирота на диске, лимит не даёт
// лить их гигабайтами. Процесс один (single-container deploy).
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_FILES = 30;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

function takeUploadQuota(key: string): boolean {
  const now = Date.now();
  for (const [k, w] of rateWindows) {
    if (w.resetAt <= now) rateWindows.delete(k);
  }
  const w = rateWindows.get(key);
  if (!w || w.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  w.count += 1;
  return w.count <= RATE_MAX_FILES;
}

// Билеты — чаще всего PDF; картинки тоже принимаем (скрин билета).
// PDF сохраняется как есть (не исполняемый в статике), картинки — тоже
// как есть: тут не витрина, пережимать в webp незачем. SVG запрещён
// (может нести <script> и отдаётся из /public/uploads как есть).
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Текст ошибки собирает клиент: язык страницы сюда не доходит — её
// дёргают по адресу без языкового префикса. См. src/lib/uploadErrors.ts.
const fail = (body: UploadErrorBody, status: number) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return fail({ error: "NOT_AUTHORIZED" }, 401);
  }
  if (!takeUploadQuota(user.id)) {
    // Код вне UploadErrorCode — клиент покажет общую фразу (это
    // предусмотрено в uploadErrorMessage).
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail({ error: "NO_FILE" }, 400);
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return fail({ error: "BAD_TYPE", formats: allowedFormats(ALLOWED_TYPES) }, 400);
  }
  if (file.size > MAX_SIZE) {
    return fail({ error: "TOO_LARGE", maxMb: MAX_MB }, 400);
  }

  // Приватное хранилище вне public/ — билет с ФИО и местами не должен
  // раздаваться статикой; см. src/lib/privateUploads.ts и /files/…
  const dir = privateUploadsDir("tickets");
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ url: `/files/tickets/${fileName}` });
}
