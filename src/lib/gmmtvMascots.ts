import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { prisma } from "@/lib/prisma";
import { fetchMediaWikiParsedHtml, contentAfterHeading } from "@/lib/mediawikiParse";
import { matchMascotOwners, type MatchedMascotOwner } from "@/lib/performerMatching";
import { getSetting, setSetting } from "@/lib/siteSettings";
import { notifyAdmins } from "@/lib/adminNotify";

// Краулер маскотов GMMTV со страницы gmmtv.fandom.com/wiki/Mascots
// (недельная задача "gmmtv-mascots" в расписании, см.
// docs/features/gmmtv-mascots-import.md). Fandom — это MediaWiki, ходим
// через официальный api.php, как остальные вики-импортёры
// (mediawikiParse.ts), а не скрейпингом. Найденные новые маскоты
// становятся черновиками MascotDraft в очереди на /admin/imports
// (вкладка «Маскоты»): публичной таблицы Performer краулер не касается,
// карточку маскота создаёт только владелец кнопкой «Одобрить».
//
// Маскоты бывают не только у GMMTV, но расписание пока ходит только по
// этой странице — у неё стабильная структура «секция на маскота».

const API_BASE = "https://gmmtv.fandom.com/api.php";
const PAGE_TITLE = "Mascots";
const PAGE_URL = "https://gmmtv.fandom.com/wiki/Mascots";
const UA = "MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";

/** Ключ SiteSetting с последней обработанной ревизией страницы: дешёвая
 *  проверка «а менялось ли вообще» (владелица про «Last edit» права —
 *  это и есть ревизия). Строка в SiteSetting, а не своя таблица:
 *  состояние — одно число. */
export const GMMTV_MASCOTS_REVISION_SETTING = "gmmtv_mascots_last_revid";

/** Владелец маскота, как он записан на вики. */
export type GmmtvMascotOwner = {
  /** Ник из текста ссылки («Tay») или из текста без ссылки («JASP.ER»). */
  name: string;
  /** Заголовок вики-страницы владельца («Tay Tawan Vihokratana»), если
   *  имя было ссылкой, — по нему матчинг разводит тёзок. */
  wikiTitle: string | null;
};

/** Одна секция страницы Mascots — один маскот. */
export type GmmtvMascot = {
  name: string;
  /** Якорь секции (id заголовка) — из него собирается sourceUrl. */
  anchor: string;
  /** Ссылка на секцию: …/wiki/Mascots#Якорь. */
  sourceUrl: string;
  /** Полноразмерная картинка со static.wikia.nocookie.net (без
   *  scale-to-width-down), null — картинки в секции нет. */
  imageUrl: string | null;
  /** Текст ячейки Description без сносок-цифр. */
  description: string;
  /** Из формулировки: «boys/girls love pair» → pair, «boy group» →
   *  group, «actor»/«actress»/«singer» → solo. */
  ownerKind: "pair" | "group" | "solo" | null;
  owners: GmmtvMascotOwner[];
};

/** NFKC + casefold + схлопнутые пробелы — ключ дедупа черновиков
 *  (MascotDraft.nameKey) и сравнение с именами каталога. */
export function normalizeMascotName(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Последняя ревизия страницы — официальный prop=revisions. Дёшево:
 *  один запрос без текста страницы. */
export async function fetchGmmtvMascotsRevision(): Promise<{ revid: number; timestamp: string }> {
  const url =
    `${API_BASE}?action=query&prop=revisions&titles=${encodeURIComponent(PAGE_TITLE)}` +
    `&rvprop=ids%7Ctimestamp&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${API_BASE} ${PAGE_TITLE} -> HTTP ${res.status}`);
  const data = await res.json();
  const pages = data?.query?.pages ?? {};
  const first = Object.values(pages)[0] as
    | { revisions?: { revid: number; timestamp: string }[] }
    | undefined;
  const rev = first?.revisions?.[0];
  if (!rev) throw new Error(`${API_BASE}: у страницы ${PAGE_TITLE} не нашлось ревизий`);
  return { revid: rev.revid, timestamp: rev.timestamp };
}

/** Убирает у фандомной картинки весь хвост после имени файла:
 *  …/Polcasan_profile_image.jpg/revision/latest/scale-to-width-down/150?cb=X
 *  → …/Polcasan_profile_image.jpg?cb=X. CDN отдаёт полноразмер и без
 *  /revision/latest, а имя файла в конце пути важно ещё и для
 *  downloadRemoteImage при одобрении: он называет локальный файл
 *  последним сегментом пути, и «latest» у всех картинок склеивал бы
 *  разных маскотов в один файл. */
function fullSizeWikiaImage(url: string): string {
  return url.replace(/\/revision\/[^?]*(?=\?|$)/, "");
}

/** Картинка секции: первый <img> первой ячейки строки с данными.
 *  Обычная секция — <figure> с lazyload-картинкой (настоящий адрес в
 *  data-src, в src — гифка-заглушка), у секций со слайдшоу (Flarey) —
 *  та же data-src внутри слайда. Логотипы соцсетей живут в третьей
 *  ячейке и сюда не попадают. */
function sectionImageUrl($: CheerioAPI, table: Cheerio<AnyNode>): string | null {
  const firstDataCell = table.find("tr").eq(1).find("td").first();
  for (const img of firstDataCell.find("img").toArray()) {
    const src = $(img).attr("data-src") ?? $(img).attr("src") ?? "";
    if (src.includes("static.wikia.nocookie.net")) return fullSizeWikiaImage(src);
  }
  return null;
}

const OWNER_KIND: Record<string, "pair" | "group" | "solo"> = {
  "boys love pair": "pair",
  "girls love pair": "pair",
  "boy group": "group",
  "girl group": "group",
  "actor and singer": "solo",
  actor: "solo",
  actress: "solo",
  singer: "solo",
};

/**
 * Владельцы из описания. Формулировка на странице устойчивая:
 * «X is/was the mascot of the [former] boys love pair <a>Tay</a>-<a>New</a>,
 * born …» / «…the boy group <a>LYKN</a>, …» / «…the actor <a>Sky</a>, …».
 * Берём кусок между «mascot of the» и первой запятой/« born» и собираем
 * в нём ссылки /wiki/… (текст — ник, title — полный заголовок страницы).
 * Ссылок нет (Flarey: «boy group JASP.ER» без ссылки) — берём голый
 * текст; пару без ссылок разбираем на двоих по «-»/«&»/« and ».
 */
function parseOwners($: CheerioAPI, descCell: Cheerio<AnyNode>): {
  ownerKind: "pair" | "group" | "solo" | null;
  owners: GmmtvMascotOwner[];
} {
  const clone = descCell.clone();
  clone.find("sup.reference").remove();
  const html = clone.html() ?? "";

  const m = html.match(
    /mascot of the\s*(?:former\s+)?(boys love pair|girls love pair|boy group|girl group|actor and singer|actress|actor|singer)?\s*([\s\S]*?)(?:,|\bborn\b|\.\s)/,
  );
  if (!m) return { ownerKind: null, owners: [] };
  const ownerKind = m[1] ? OWNER_KIND[m[1]] : null;
  const segment = m[2];

  const owners: GmmtvMascotOwner[] = [];
  const seg$ = cheerio.load(segment);
  seg$('a[href^="/wiki/"]').each((_, a) => {
    const name = seg$(a).text().trim();
    if (name) owners.push({ name, wikiTitle: seg$(a).attr("title")?.trim() || null });
  });
  if (owners.length > 0) return { ownerKind, owners };

  const plain = seg$.root().text().replace(/\s+/g, " ").trim();
  if (!plain) return { ownerKind, owners: [] };
  // «X & Y» / «X-Y» / «X and Y» — двое, только когда это заведомо пара:
  // в имени группы дефис и точка легальны (JASP.ER, Oh-Yeah).
  const names =
    ownerKind === "pair" ? plain.split(/\s*(?:[-–&]|\band\b)\s*/).filter(Boolean) : [plain];
  return { ownerKind, owners: names.map((name) => ({ name, wikiTitle: null })) };
}

/**
 * Разбирает HTML страницы Mascots (вывод action=parse). Структура — не
 * одна общая таблица, а секция на маскота: <h2> с именем (плоский,
 * без обёртки mw-heading — contentAfterHeading это различает сам),
 * сразу за ним <table class="fandom-table"> из трёх колонок
 * Image / Description / Accounts и, у части, строкой «Live debut: …».
 */
export function parseGmmtvMascots(html: string): GmmtvMascot[] {
  const $ = cheerio.load(html);
  const mascots: GmmtvMascot[] = [];

  $("h2 > span.mw-headline").each((_, el) => {
    const headline = $(el);
    const anchor = headline.attr("id") ?? "";
    const name = headline.text().replace(/\s+/g, " ").trim();
    if (!name || !anchor || /^references$/i.test(name)) return;

    const content = contentAfterHeading($, headline.parent());
    const contentNode = content.get(0);
    if (!contentNode || !("tagName" in contentNode) || contentNode.tagName !== "table") return;

    const cells = content.find("tr").eq(1).find("td");
    // Ячейка описания — та, где формулировка про владельца; на случай
    // смены порядка колонок ищем по тексту, а не по индексу.
    let descCell = cells.filter((_, td) => $(td).text().includes("mascot of")).first();
    if (descCell.length === 0) descCell = cells.eq(1);

    const descClone = descCell.clone();
    descClone.find("sup.reference").remove();
    const description = descClone.text().replace(/\s+/g, " ").trim();

    const { ownerKind, owners } = parseOwners($, descCell);
    mascots.push({
      name,
      anchor,
      sourceUrl: `${PAGE_URL}#${anchor}`,
      imageUrl: sectionImageUrl($, content),
      description,
      ownerKind,
      owners,
    });
  });

  return mascots;
}

export type GmmtvMascotsCrawlResult = {
  /** Ревизия не менялась — прогон закончился, не скачивая страницу. */
  unchanged: boolean;
  /** Ревизия страницы, с которой сверялись/которую обработали. */
  revid: number;
  /** Секций-маскотов на странице. */
  onPage: number;
  /** Уже есть в каталоге (Performer type MASCOT, по нормализованному имени). */
  inCatalog: number;
  /** Уже известны черновиками (PENDING в очереди или вечное REJECTED/APPROVED). */
  knownDrafts: number;
  /** Новых черновиков PENDING за этот прогон. */
  newPending: number;
  /** У скольких новых черновиков совпал хотя бы один владелец. */
  withOwners: number;
  /** Имена совпавших владельцев — в сводку прогона. */
  matchedOwnerNames: string[];
  /** Не найденные в каталоге имена владельцев новых черновиков. */
  unmatchedOwnerNames: string[];
};

/** Payload черновика — распарс секции + несовпавшие владельцы (очередь
 *  рисует их серым «не нашли: …» без похода в матчинг). */
export type MascotDraftPayload = GmmtvMascot & { unmatchedOwners: string[] };

export async function runGmmtvMascotsCrawl(
  opts: { runId?: string | null } = {},
): Promise<GmmtvMascotsCrawlResult> {
  const runId = opts.runId ?? null;

  // 1. Дешёвая проверка изменений: ревизия страницы та же, что в прошлый
  // раз, — таблицу не парсим вовсе, прогон заканчивается мгновенно.
  const revision = await fetchGmmtvMascotsRevision();
  const lastProcessed = await getSetting(GMMTV_MASCOTS_REVISION_SETTING);
  const result: GmmtvMascotsCrawlResult = {
    unchanged: false,
    revid: revision.revid,
    onPage: 0,
    inCatalog: 0,
    knownDrafts: 0,
    newPending: 0,
    withOwners: 0,
    matchedOwnerNames: [],
    unmatchedOwnerNames: [],
  };
  if (lastProcessed !== null && lastProcessed === String(revision.revid)) {
    result.unchanged = true;
    return result;
  }

  // 2. Страница целиком — официальным action=parse.
  const html = await fetchMediaWikiParsedHtml(API_BASE, PAGE_TITLE, UA);
  const mascots = parseGmmtvMascots(html);
  // Пустой распарс при непустой странице — сменилась разметка, а не
  // пропали маскоты: падаем честно и ревизию НЕ запоминаем, чтобы
  // следующий прогон не решил «изменений нет».
  if (mascots.length === 0) {
    throw new Error("страница Mascots распарсилась в ноль секций — похоже, сменилась разметка");
  }
  result.onPage = mascots.length;

  // 3. Память: маскоты каталога (включая заведённых руками) и уже
  // существующие черновики. REJECTED — вечная память, решение владельца
  // повторный обход не воскрешает; PENDING не перекачиваем — он и так
  // ждёт в очереди (как у краулера TTM).
  const catalog = await prisma.performer.findMany({
    where: { type: "MASCOT" },
    select: { name: true },
  });
  const catalogKeys = new Set(catalog.map((p) => normalizeMascotName(p.name)));
  const drafts = await prisma.mascotDraft.findMany({
    where: { nameKey: { in: mascots.map((m) => normalizeMascotName(m.name)) } },
    select: { nameKey: true },
  });
  const draftKeys = new Set(drafts.map((d) => d.nameKey));

  for (const mascot of mascots) {
    const nameKey = normalizeMascotName(mascot.name);
    if (catalogKeys.has(nameKey)) {
      result.inCatalog++;
      continue;
    }
    if (draftKeys.has(nameKey)) {
      result.knownDrafts++;
      continue;
    }

    // 4. Матчинг владельцев: актёры (SOLO по name/realName/musicAlias)
    // и группы (BAND по name), тёзок разводит заголовок вики-страницы.
    const { matched, unmatched } = await matchMascotOwners(
      mascot.owners.map((o) => ({
        name: o.name,
        wikiTitle: o.wikiTitle,
        kindHint: mascot.ownerKind,
      })),
    );

    const payload: MascotDraftPayload = { ...mascot, unmatchedOwners: unmatched };
    const draft = await prisma.mascotDraft.create({
      data: {
        nameKey,
        name: mascot.name,
        sourceUrl: mascot.sourceUrl,
        payload: JSON.parse(JSON.stringify(payload)),
        matchedOwners: matched satisfies MatchedMascotOwner[],
      },
    });
    result.newPending++;
    if (matched.length > 0) {
      result.withOwners++;
      result.matchedOwnerNames.push(...matched.map((m) => m.name));
    }
    result.unmatchedOwnerNames.push(...unmatched);

    if (runId) {
      // След в журнале «последнего спарсенного» — из этих строк
      // собирается история задачи на вкладке расписания (logsItems).
      await prisma.importedItem.create({
        data: {
          runId,
          entityType: "mascot-draft",
          entityId: draft.id,
          action: "created",
          label: mascot.name,
        },
      });
    }
  }

  // 5. Ревизию запоминаем только после успешной обработки: упавший на
  // середине прогон не должен «съесть» изменение.
  await setSetting(GMMTV_MASCOTS_REVISION_SETTING, String(revision.revid));

  // 6. Одно уведомление на прогон, не по сообщению на черновик.
  if (result.newPending > 0) {
    const appUrl = process.env.APP_URL || "";
    await notifyAdmins(
      "import",
      `Черновики маскотов: +${result.newPending}, ждут проверки` +
        (appUrl ? `\n${appUrl}/admin/imports?tab=mascots` : ""),
      { dedupKey: runId ?? "gmmtv-mascots" },
    );
  }

  return result;
}

/** Сводка прогона — общая для журнала импортов и строки расписания. */
export function summarizeGmmtvMascots(r: GmmtvMascotsCrawlResult): string {
  if (r.unchanged) return `изменений нет (ревизия ${r.revid} уже обработана)`;
  const names = [...new Set(r.matchedOwnerNames)];
  const unmatched = [...new Set(r.unmatchedOwnerNames)];
  return (
    `на странице ${r.onPage}, уже в каталоге ${r.inCatalog}, черновиков +${r.newPending}` +
    (r.withOwners ? ` (владельцы совпали у ${r.withOwners}: ${names.slice(0, 8).join(", ")})` : "") +
    (unmatched.length ? `, не нашли владельцев: ${unmatched.slice(0, 8).join(", ")}` : "") +
    (r.knownDrafts ? `, знакомых черновиков ${r.knownDrafts}` : "") +
    ` · ревизия ${r.revid}`
  );
}
