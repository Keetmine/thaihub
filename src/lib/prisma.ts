import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { slugify, shortCode } from "@/lib/slug";

// Автослаги через расширение клиента — ЕДИНСТВЕННАЯ точка генерации для
// всех путей создания (админ-формы, полтора десятка импортёров, инлайн-
// комбобоксы): каждый create/upsert каталожной сущности получает slug из
// названия (при совпадении — -2/-3), поездки и списки — название +
// короткий код (названия у пользователей повторяются постоянно, а
// нумерация раскрывала бы чужие количества). Слаг стабилен: при
// переименовании НЕ меняется, чтобы не ломать сохранённые ссылки.

const CATALOG_SLUG_MODELS: Record<string, string> = {
  Performer: "name",
  Drama: "title",
  Event: "title",
  Location: "name",
  Agency: "name",
  Novel: "title",
  WikiArticle: "title",
};
const CODED_SLUG_MODELS: Record<string, string> = {
  Trip: "title",
  PlaceList: "title",
  PerformerList: "title",
};

/**
 * Сообщества: чистый адрес, пока имя свободно, и суффикс — только при
 * совпадении (правка владельца 2026-09-09: «а почему в ссылке в конце
 * ttbc?»).
 *
 * Поездки и списки остаются с кодом всегда: их заводят десятками и
 * названия там повторяются постоянно. Сообщество — вещь публичная, его
 * адресом делятся и его же читают глазами, а тёзок у него единицы.
 * Нумерации -2/-3 при совпадении не даём по-прежнему: она выдавала бы,
 * сколько таких сообществ уже есть.
 *
 * Адреса УЖЕ созданных сообществ не трогаем: по ним ходят ссылки.
 */
const FREE_SLUG_MODELS: Record<string, string> = {
  Community: "title",
};

function makeBase(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient | undefined;
};

// instanceof-проверка: после `prisma generate` (новая модель в схеме)
// HMR пересобирает модуль с НОВЫМ классом PrismaClient, а закешированный
// на globalThis экземпляр остаётся старым — без делегатов новых моделей
// (prisma.<новаяМодель> === undefined до перезапуска dev-сервера).
// Несовпадение класса означает «клиент перегенерирован» — создаём свежий.
const base =
  globalForPrisma.prismaBase instanceof PrismaClient
    ? globalForPrisma.prismaBase
    : makeBase();
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

async function uniqueCatalogSlug(
  model: string,
  name: string,
  // Для тёзок-исполнителей: занято «tui» → пробуем «tui-kiatkamol-lata»
  // (ник + реальное имя) прежде, чем скатываться в безликие -2/-3.
  disambiguator?: string | null,
): Promise<string | null> {
  const baseSlug = slugify(name);
  if (!baseSlug) return null;
  // Запросы по slug через «сырое» делегирование — модель динамическая.
  const delegate = (base as unknown as Record<
    string,
    {
      findFirst: (q: object) => Promise<unknown>;
      findMany: (q: object) => Promise<{ slug: string | null }[]>;
    }
  >)[model.charAt(0).toLowerCase() + model.slice(1)];

  // Все занятые варианты одним запросом (раньше кандидаты пробовались
  // по одному findFirst — при импорте тёзок это давало до 50 запросов
  // на КАЖДУЮ создаваемую запись).
  const takenRows = await delegate.findMany({
    where: { OR: [{ slug: baseSlug }, { slug: { startsWith: `${baseSlug}-` } }] },
    select: { slug: true },
  });
  const takenSet = new Set(takenRows.map((r) => r.slug));

  if (!takenSet.has(baseSlug)) return baseSlug;

  if (disambiguator) {
    const combined = slugify(`${name} ${disambiguator}`);
    if (combined && combined !== baseSlug) {
      // Обычно combined начинается с baseSlug- и уже покрыт выборкой;
      // на экзотический случай другого префикса — одна точечная проверка.
      const combinedTaken = combined.startsWith(`${baseSlug}-`)
        ? takenSet.has(combined)
        : !!(await delegate.findFirst({ where: { slug: combined }, select: { slug: true } }));
      if (!combinedTaken) return combined;
    }
  }

  for (let n = 1; n < 50; n++) {
    const candidate = `${baseSlug}-${n + 1}`;
    if (!takenSet.has(candidate)) return candidate;
  }
  return `${baseSlug}-${shortCode()}`;
}

/** Чистый слаг, если он свободен, иначе — с коротким кодом. */
async function freeSlug(model: string, title: string): Promise<string> {
  const baseSlug = slugify(title);
  // Название только на тайском/эмодзи — базы нет вовсе, остаётся код.
  if (!baseSlug) return `p-${shortCode()}${shortCode()}`;
  const delegate = (base as unknown as Record<
    string,
    { findFirst: (q: object) => Promise<unknown> }
  >)[model.charAt(0).toLowerCase() + model.slice(1)];
  const taken = await delegate.findFirst({ where: { slug: baseSlug }, select: { slug: true } });
  return taken ? `${baseSlug}-${shortCode()}` : baseSlug;
}

/**
 * Занят ли слаг — проверка перед вставкой и сама вставка идут разными
 * запросами, так что двое, заводящие тёзок одновременно, могут
 * договориться об одном и том же чистом адресе. Ошибку уникальности в
 * этом случае не показываем человеку: второму просто достаётся адрес с
 * кодом.
 */
function isSlugConflict(e: unknown): boolean {
  const err = e as { code?: string; meta?: { target?: unknown } };
  if (err?.code !== "P2002") return false;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes("slug") : String(target ?? "").includes("slug");
}

function codedSlug(title: string): string | null {
  const baseSlug = slugify(title);
  return baseSlug ? `${baseSlug}-${shortCode()}` : `p-${shortCode()}${shortCode()}`;
}

export const prisma = base.$extends({
  query: {
    $allModels: {
      async create({ model, args, query }) {
        const a = args as { data?: Record<string, unknown> };
        if (a.data && a.data.slug === undefined) {
          const catalogField = CATALOG_SLUG_MODELS[model];
          const codedField = CODED_SLUG_MODELS[model];
          if (catalogField && typeof a.data[catalogField] === "string") {
            a.data.slug = await uniqueCatalogSlug(
              model,
              a.data[catalogField] as string,
              model === "Performer" && typeof a.data.realName === "string"
                ? (a.data.realName as string)
                : null,
            );
          } else if (codedField && typeof a.data[codedField] === "string") {
            a.data.slug = codedSlug(a.data[codedField] as string);
          } else if (
            FREE_SLUG_MODELS[model] &&
            typeof a.data[FREE_SLUG_MODELS[model]] === "string"
          ) {
            const title = a.data[FREE_SLUG_MODELS[model]] as string;
            a.data.slug = await freeSlug(model, title);
            try {
              return await query(args);
            } catch (e) {
              if (!isSlugConflict(e)) throw e;
              a.data.slug = codedSlug(title);
              return query(args);
            }
          }
        }
        return query(args);
      },
      async upsert({ model, args, query }) {
        const a = args as { create?: Record<string, unknown> };
        if (a.create && a.create.slug === undefined) {
          const catalogField = CATALOG_SLUG_MODELS[model];
          const codedField = CODED_SLUG_MODELS[model];
          if (catalogField && typeof a.create[catalogField] === "string") {
            a.create.slug = await uniqueCatalogSlug(
              model,
              a.create[catalogField] as string,
              model === "Performer" && typeof a.create.realName === "string"
                ? (a.create.realName as string)
                : null,
            );
          } else if (codedField && typeof a.create[codedField] === "string") {
            a.create.slug = codedSlug(a.create[codedField] as string);
          } else if (
            FREE_SLUG_MODELS[model] &&
            typeof a.create[FREE_SLUG_MODELS[model]] === "string"
          ) {
            a.create.slug = await freeSlug(model, a.create[FREE_SLUG_MODELS[model]] as string);
          }
        }
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;
