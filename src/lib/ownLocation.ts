import { prisma } from "@/lib/prisma";
import { resolveMapsCoords, resolveMapsCoordsViaHttp } from "@/lib/blscene";
import { isLocationCategory } from "@/lib/locationCategories";
import { getT } from "@/lib/i18n";

// Обычный модуль БЕЗ "use server" — сознательно. Раньше createOwnLocation
// экспортировался из lists/actions.ts и потому был публичным server
// action: любой POST мог создать локацию от имени ЧУЖОГО userId, минуя
// аутентификацию. Здесь функции — простые импорты: снаружи их не
// вызвать, userId в них передают только экшены, уже проверившие сессию
// через getCurrentUser.

// Координаты из maps-ссылки пользователя. Сначала дешёвый HTTP-резолв
// (редиректы коротких ссылок часто несут координаты прямо в URL);
// браузер — только fallback для ссылок формата ?q=адрес&ftid=…, и
// строго по одному: параллельные клики выстраиваются в очередь, чтобы
// несколько Chromium (~250 МБ каждый) не уронили веб-процесс по памяти.
let mapsBrowserQueue: Promise<unknown> = Promise.resolve();

export async function resolveUserMapsCoords(url: string) {
  const viaHttp = await resolveMapsCoordsViaHttp(url);
  if (viaHttp) return viaHttp;

  const task = mapsBrowserQueue.then(async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      return await resolveMapsCoords(url, browser);
    } finally {
      await browser.close();
    }
  });
  mapsBrowserQueue = task.catch(() => {});
  return task;
}

/**
 * Создание своего места (не из каталога сериалов): название + ссылка
 * Google Maps ИЛИ голые координаты «13.75, 100.50». Длинные maps-ссылки
 * несут координаты в URL (regex), короткие maps.app.goo.gl резолвятся
 * через resolveUserMapsCoords (HTTP-редиректы, браузер — в крайнем
 * случае и по одному). Такое место помечено createdByUserId и в общий
 * каталог локаций не попадает.
 *
 * Разбирает форму и создаёт саму локацию — без привязки к чему-либо:
 * то же место заводится и в список (lists/actions.ts), и прямо в
 * поездку (createTripOwnPlace в trips/actions.ts).
 */
export async function createOwnLocation(
  formData: FormData,
  userId: string,
): Promise<{ ok: true; locationId: string; note: string | null } | { ok: false; error: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const mapsInput = String(formData.get("mapsUrl") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  if (!name) return { ok: false, error: (await getT()).t.lists.errors.placeNameRequired };

  let coords: { lat: number; lng: number } | null = null;
  if (mapsInput) {
    // Голые координаты «13.7563, 100.5018» — без похода куда-либо.
    const raw = mapsInput.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (raw) {
      coords = { lat: parseFloat(raw[1]), lng: parseFloat(raw[2]) };
    } else {
      coords = await resolveUserMapsCoords(mapsInput);
    }
  }

  const rawCategory = String(formData.get("category") ?? "").trim();
  const location = await prisma.location.create({
    data: {
      name,
      createdByUserId: userId,
      photoUrl: photoUrl || null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      category: rawCategory && isLocationCategory(rawCategory) ? rawCategory : null,
    },
  });
  return { ok: true, locationId: location.id, note: note || null };
}

/**
 * Можно ли текущему пользователю ссылаться на эту локацию (класть в
 * список, в поездку, отмечать посещение). id приходит с клиента, и без
 * проверки по нему подтягивалось чужое приватное место — вместе с его
 * названием и координатами. Разрешены каталожные локации
 * (createdByUserId == null) и свои собственные.
 */
export async function canUseLocation(locationId: string, userId: string): Promise<boolean> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { createdByUserId: true },
  });
  if (!location) return false;
  return location.createdByUserId === null || location.createdByUserId === userId;
}
