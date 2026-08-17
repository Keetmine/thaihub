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
};
const CODED_SLUG_MODELS: Record<string, string> = {
  Trip: "title",
  PlaceList: "title",
  PerformerList: "title",
};

function makeBase(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient | undefined;
};

const base = globalForPrisma.prismaBase ?? makeBase();
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

async function uniqueCatalogSlug(model: string, name: string): Promise<string | null> {
  const baseSlug = slugify(name);
  if (!baseSlug) return null;
  // findFirst по slug через «сырое» делегирование — модель динамическая.
  const delegate = (base as unknown as Record<string, { findFirst: (q: object) => Promise<unknown> }>)[
    model.charAt(0).toLowerCase() + model.slice(1)
  ];
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? baseSlug : `${baseSlug}-${n + 1}`;
    const exists = await delegate.findFirst({ where: { slug: candidate }, select: { slug: true } });
    if (!exists) return candidate;
  }
  return `${baseSlug}-${shortCode()}`;
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
            a.data.slug = await uniqueCatalogSlug(model, a.data[catalogField] as string);
          } else if (codedField && typeof a.data[codedField] === "string") {
            a.data.slug = codedSlug(a.data[codedField] as string);
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
            a.create.slug = await uniqueCatalogSlug(model, a.create[catalogField] as string);
          } else if (codedField && typeof a.create[codedField] === "string") {
            a.create.slug = codedSlug(a.create[codedField] as string);
          }
        }
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;
