/**
 * Разбор и нормализация профилей с kprofiles.com — чистые функции, без
 * БД. Сбор страниц — scripts/kprofiles-collect.ts, сопоставление и
 * импорт — scripts/kprofiles-match.ts и scripts/kprofiles-import.ts
 * (см. docs/features/kprofiles-import.md).
 *
 * Разовый источник (просьба владельца 2026-09-26: «стянем всю инфу,
 * переведём, дозаполним то, чего нет; парсер по расписанию не нужен»).
 * Разметка у сайта одна много лет, страницы собраны руками: блок
 * профиля — строки «Подпись: значение», затем «<Имя> Facts:» и список
 * фактов через тире. Разбираем ТЕКСТ, а не DOM: одинаковых классов у
 * страниц нет.
 */

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&nbsp;/g, " ");
}

/** Тело статьи → строки текста. Картинки остаются маркером `[img:…]`,
 *  чтобы найти фото блока и подпись («Official Signature»). */
export function kpBodyLines(html: string): string[] {
  const start = html.indexOf('class="entry-content');
  if (start < 0) return [];
  let body = html.slice(start);
  const end = body.search(/class="(entry-footer|herald-related|comments-area)/);
  if (end > 0) body = body.slice(0, end);
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  // Только атрибут src: `[^>]+` жадный и иначе уползал бы в srcset.
  body = body.replace(/<img\b[^>]*?\ssrc="([^"]+)"[^>]*>/gi, "\n[img:$1]\n");
  body = body.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");
  body = body.replace(/<[^>]+>/g, "");
  return decode(body)
    .split("\n")
    .map((l) => l.replace(/ /g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export type KpProfile = {
  sourceUrl: string;
  /** Ник и его тайское написание из «Stage Name: Becky (เบ็คกี)». */
  stageName: string | null;
  stageNameThai: string | null;
  birthName: string | null;
  birthNameThai: string | null;
  /** Первая строка-аннотация: «X is a Thai actress and model under Y». */
  intro: string | null;
  /** Все «Подпись: значение» как есть — чтобы не терять то, для чего у
   *  нас пока нет поля. */
  fields: Record<string, string>;
  facts: string[];
  photoUrl: string | null;
  /** Картинка под «Official Signature», если есть. */
  signatureUrl: string | null;
};

// Ключ может быть и одной буквой: соцсеть «X: @handle».
const FIELD_RE = /^([A-Za-z][A-Za-z .\/()&'’-]{0,40}):\s*(.*)$/;
const FACTS_HEAD_RE = /^(.{1,60}?)\s+Facts:?\s*$/i;
const FACT_RE = /^[–—-]\s*(.+)$/;
/** Тайское написание в скобках; на сайте бывает и «(โชกุน}» — с не той
 *  закрывающей. */
const THAI_PAREN_RE = /^(.*?)\s*\(([^)}\]]*)[)}\]]\s*$/;

/** Разбивает страницу на блоки профилей и разбирает каждый. У страницы
 *  одного человека блок один; у страницы группы — по участнику. */
export function parseKpPage(html: string, sourceUrl: string): KpProfile[] {
  const lines = kpBodyLines(html);
  const profiles: KpProfile[] = [];
  let cur: KpProfile | null = null;
  let inFacts = false;
  let pendingSignature = false;
  // На новых страницах одиночек подпись стоит ДО блока профиля (сразу
  // после «Official Fandom Name / Color(s)»): картинку запоминаем и
  // отдаём профилю, когда он появится.
  let orphanSignature: string | null = null;
  let lastImg: string | null = null;
  let introCandidate: string | null = null;

  const flush = () => {
    if (cur && (cur.stageName || cur.birthName)) profiles.push(cur);
    cur = null;
    inFacts = false;
  };

  for (const line of lines) {
    const img = line.match(/^\[img:(.+)\]$/);
    if (img) {
      if (pendingSignature) {
        if (cur) cur.signatureUrl = img[1];
        else orphanSignature = img[1];
        pendingSignature = false;
      } else {
        lastImg = img[1];
        if (cur && !cur.photoUrl && !inFacts) cur.photoUrl = img[1];
      }
      continue;
    }

    if (FACTS_HEAD_RE.test(line) && cur) {
      inFacts = true;
      continue;
    }

    if (inFacts) {
      const f = line.match(FACT_RE);
      if (f && cur) {
        cur.facts.push(f[1].trim());
        continue;
      }
      if (!FIELD_RE.test(line)) {
        introCandidate = line;
        continue;
      }
      inFacts = false;
    }

    const field = line.match(FIELD_RE);
    if (!field) {
      if (/\bis a\b.*\b(actor|actress|singer|model|idol)/i.test(line)) introCandidate = line;
      continue;
    }
    const key = field[1].trim();
    const val = field[2].trim();

    // «Official Signature:» почти всегда с именем впереди: «Anthony
    // Official Signature:», «IU’s Official Signature:» — ловим по хвосту.
    if (/official signatures?$|^signature$/i.test(key)) {
      pendingSignature = true;
      continue;
    }

    if (/^(stage name|nickname)$/i.test(key)) {
      flush();
      cur = {
        sourceUrl,
        stageName: null,
        stageNameThai: null,
        birthName: null,
        birthNameThai: null,
        intro: introCandidate,
        fields: {},
        facts: [],
        photoUrl: lastImg,
        signatureUrl: orphanSignature,
      };
      orphanSignature = null;
      introCandidate = null;
      const m = val.match(THAI_PAREN_RE);
      cur.stageName = (m ? m[1] : val).trim() || null;
      cur.stageNameThai = m ? m[2].trim() || null : null;
      continue;
    }
    if (!cur) continue;

    if (/^birth name$/i.test(key)) {
      const m = val.match(THAI_PAREN_RE);
      cur.birthName = (m ? m[1] : val).trim() || null;
      cur.birthNameThai = m ? m[2].trim() || null : null;
      continue;
    }
    if (val) cur.fields[key] = val;
  }
  flush();
  return profiles;
}

// ---------- нормализация значений ----------

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** «March 9, 1992» / «December 05, 2002» / «9 March 1992» → «1992-03-09».
 *  Без года («March 9») — null: дата без года у нас не хранится. */
export function parseKpBirthday(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let m = t.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/);
  let month: number | undefined;
  let day: string | undefined;
  let year: string | undefined;
  if (m) {
    month = MONTHS[m[1].toLowerCase()];
    day = m[2];
    year = m[3];
  } else {
    m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m) {
      month = MONTHS[m[2].toLowerCase()];
      day = m[1];
      year = m[3];
    }
  }
  if (!month || !day || !year) return null;
  return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** «179 cm (5’10”)» → «179 cm»; «5’10”» без сантиметров — null: в
 *  карточке у нас метрика, футы не пересчитываем. */
export function parseKpHeight(text: string | null | undefined): string | null {
  const m = text?.match(/(\d{2,3}(?:[.,]\d)?)\s*cm/i);
  return m ? `${m[1].replace(",", ".")} cm` : null;
}

/** «70 kg (154 lbs)» → «70 kg». */
export function parseKpWeight(text: string | null | undefined): string | null {
  const m = text?.match(/(\d{2,3}(?:[.,]\d)?)\s*kg/i);
  return m ? `${m[1].replace(",", ".")} kg` : null;
}

/** «O», «AB», «B (Rh+)» → «O» / «AB» / «B»; «N/A», «Unknown» → null. */
export function parseKpBloodType(text: string | null | undefined): string | null {
  const m = text?.trim().match(/^(A|B|AB|O)\b/i);
  return m ? m[1].toUpperCase() : null;
}

/** «INFP», «ENFJ-T», «INFJ (Advocate)» → «INFP» / «ENFJ» / «INFJ»;
 *  «N/A» → null. Подтипы -A/-T не храним. */
export function parseKpMbti(text: string | null | undefined): string | null {
  const m = text?.trim().match(/^([EI][NS][FT][JP])\b/i);
  return m ? m[1].toUpperCase() : null;
}

/** Хэндл соцсети: «@mark_sorntast» / «mark_sorntast» / ссылка → «mark_sorntast».
 *  Несколько через запятую или «/» — первый. */
export function parseKpHandle(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  // Ссылка — раньше разбиения по «/»: иначе первым куском был бы «https:».
  const url = t.match(/https?:\/\/[^\s,]+?\/@?([^/?#\s,]+)\/?(?=[\s,]|$)/i);
  const first = url ? url[1] : t.split(/[,/]\s*|\s+\/\s+|\s{2,}/)[0].trim();
  const raw = first.replace(/^@/, "").trim();
  if (!raw || /^n\/?a$/i.test(raw) || /\s/.test(raw)) return null;
  return raw;
}

export type KpSocial = { platform: "instagram" | "x" | "tiktok" | "facebook" | "youtube"; handle: string };

/** Соцсети из полей профиля → пары «платформа, хэндл». Facebook и
 *  YouTube на сайте часто подписаны названием страницы, а не хэндлом —
 *  такие пропускаем: ссылку из них не собрать. */
export function kpSocials(fields: Record<string, string>): KpSocial[] {
  const out: KpSocial[] = [];
  const pick = (keys: string[], platform: KpSocial["platform"]) => {
    for (const k of keys) {
      const h = parseKpHandle(fields[k]);
      if (h) {
        out.push({ platform, handle: h });
        return;
      }
    }
  };
  pick(["Instagram"], "instagram");
  pick(["X", "Twitter"], "x");
  pick(["TikTok", "Tiktok", "TikTik"], "tiktok");
  return out;
}

export function kpSocialUrl(s: KpSocial): string {
  switch (s.platform) {
    case "instagram":
      return `https://www.instagram.com/${s.handle}/`;
    case "x":
      return `https://x.com/${s.handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${s.handle}`;
    case "facebook":
      return `https://www.facebook.com/${s.handle}`;
    case "youtube":
      return `https://www.youtube.com/@${s.handle}`;
  }
}

/** Место рождения из факта «She was born in Bangkok, Thailand.» →
 *  «Bangkok, Thailand». Берём только явную формулу «born in …». */
export function kpPlaceOfBirth(facts: string[]): string | null {
  for (const f of facts) {
    const m = f.match(/\bborn (?:and raised )?in ([A-Z][^.;(]{2,60}?)(?:[.;(]|$)/);
    if (m) return m[1].trim().replace(/,$/, "");
  }
  return null;
}

/** Профильные ключи, которые считаем данными, а не обвязкой страницы
 *  (Note, Made by, Total Votes — это виджет голосования и просьба не
 *  копировать текст). Всё остальное в `fields` остаётся в сырой
 *  выгрузке, но в карточку не идёт. */
export const KP_PROFILE_KEYS = new Set([
  "Birthday", "Zodiac Sign", "Thai Zodiac Sign", "Chinese Zodiac Sign", "Height", "Weight",
  "Blood Type", "MBTI Type", "MBTI", "Nationality", "Instagram", "X", "Twitter", "TikTok",
  "Tiktok", "TikTik", "Facebook", "YouTube", "Weibo", "Company", "Agency", "Label",
  "English Name", "Chinese Name", "Position", "Occupation",
]);

export type KpNormalized = {
  sourceUrl: string;
  stageName: string | null;
  stageNameThai: string | null;
  birthName: string | null;
  birthNameThai: string | null;
  birthDate: string | null;
  height: string | null;
  weight: string | null;
  bloodType: string | null;
  mbti: string | null;
  nationality: string | null;
  company: string | null;
  placeOfBirth: string | null;
  socials: KpSocial[];
  photoUrl: string | null;
  signatureUrl: string | null;
  facts: string[];
};

export function normalizeKpProfile(p: KpProfile): KpNormalized {
  const f = p.fields;
  return {
    sourceUrl: p.sourceUrl,
    stageName: p.stageName,
    stageNameThai: p.stageNameThai,
    birthName: p.birthName,
    birthNameThai: p.birthNameThai,
    birthDate: parseKpBirthday(f["Birthday"]),
    height: parseKpHeight(f["Height"]),
    weight: parseKpWeight(f["Weight"]),
    bloodType: parseKpBloodType(f["Blood Type"]),
    mbti: parseKpMbti(f["MBTI Type"] ?? f["MBTI"]),
    nationality: f["Nationality"]?.trim() || null,
    company: (f["Company"] ?? f["Agency"] ?? f["Label"])?.trim() || null,
    placeOfBirth: kpPlaceOfBirth(p.facts),
    socials: kpSocials(f),
    photoUrl: p.photoUrl,
    signatureUrl: p.signatureUrl,
    facts: p.facts,
  };
}

// ---------- сопоставление с каталогом ----------

/** Строка нашего каталога, достаточная для сопоставления. */
export type KpCatalogRow = {
  id: string;
  name: string;
  realName: string | null;
  alsoKnownAs: string | null;
  /** Хэндлы инстаграма из ссылок карточки, в нижнем регистре. */
  instagram: string[];
};

export type KpMatch =
  | { performerId: string; via: "instagram" | "realName" | "nickname" | "tokens" }
  | { performerId: null; via: "ambiguous" | "none"; candidates: string[] };

const compact = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z]/g, "");
const tokens = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

/**
 * Кто из каталога — этот человек с kprofiles. Признаки по убыванию
 * надёжности, первый сработавший и решает:
 *
 *  1. **инстаграм** — хэндл уникален, тёзки исключены;
 *  2. **настоящее имя** целиком, без пробелов и дефисов («Chiva-aree»
 *     ↔ «Chivaaree»); при нескольких тёзках — неоднозначно;
 *  3. **все слова** более короткого настоящего имени входят в более
 *     длинное («Rebecca Armstrong» ⊂ «Rebecca Patricia Armstrong»);
 *  4. **ник + фамилия**: на kprofiles нет строки Birth Name, а в stage
 *     name — «Jeff Satur»; у нас name «Jeff» и realName «… Satur».
 *
 * Единственный ник без фамилии сопоставляется, только если он у нас
 * один: «Noeul» — да, «Boss» — нет (их четверо). Несовпавшее и
 * неоднозначное уходит владельцу глазами, а не в базу.
 */
export function matchKpToCatalog(
  profile: { stageName: string | null; birthName: string | null; socials: KpSocial[] },
  rows: KpCatalogRow[],
): KpMatch {
  const ig = profile.socials.find((s) => s.platform === "instagram")?.handle.toLowerCase();
  if (ig) {
    const hit = rows.filter((r) => r.instagram.includes(ig));
    if (hit.length === 1) return { performerId: hit[0].id, via: "instagram" };
  }

  const bc = compact(profile.birthName);
  const bt = tokens(profile.birthName);
  const sc = compact(profile.stageName);
  if (bc.length >= 6) {
    // Полное имя может лежать и в name целиком — «Becky Rebecca Patricia
    // Armstrong» с пустым realName: карточка заведена парсером одной строкой.
    const exact = rows.filter(
      (r) => compact(r.realName) === bc || compact(r.name) === bc || (sc && compact(r.name) === sc + bc),
    );
    if (exact.length === 1) return { performerId: exact[0].id, via: "realName" };
    if (exact.length > 1) return { performerId: null, via: "ambiguous", candidates: exact.map((r) => r.name) };

    if (bt.length >= 2) {
      const sub = rows.filter((r) => {
        // У карточек без realName имя часто и есть полное имя.
        const rt = r.realName ? tokens(r.realName) : tokens(r.name);
        if (rt.length < 2) return false;
        const [short, long] = rt.length <= bt.length ? [rt, bt] : [bt, rt];
        return short.every((t) => long.includes(t));
      });
      if (sub.length === 1) return { performerId: sub[0].id, via: "tokens" };
      if (sub.length > 1) return { performerId: null, via: "ambiguous", candidates: sub.map((r) => r.name) };
    }
  }

  const st = tokens(profile.stageName);
  if (st.length >= 2) {
    const nick = compact(st[0]);
    const rest = st.slice(1);
    const hit = rows.filter(
      (r) => compact(r.name) === nick && rest.every((t) => tokens(r.realName).includes(t)),
    );
    if (hit.length === 1) return { performerId: hit[0].id, via: "nickname" };
    if (hit.length > 1) return { performerId: null, via: "ambiguous", candidates: hit.map((r) => r.name) };
  }
  if (st.length === 1 && !profile.birthName) {
    const hit = rows.filter((r) => compact(r.name) === compact(st[0]));
    if (hit.length === 1) return { performerId: hit[0].id, via: "nickname" };
    if (hit.length > 1) return { performerId: null, via: "ambiguous", candidates: hit.map((r) => r.name) };
  }
  // 5. Ник совпал И фамилия совпала — транслитерация имени гуляет
  //    («Natasitt» ↔ «Natasit», «Chanikan» ↔ «Chanikarn»), а ник с
  //    фамилией вместе уникальны. Ник сравниваем с первым словом name
  //    («Gena Desouza» — name из двух слов), фамилию — с последним
  //    словом realName или name.
  const surnameOf = (r: KpCatalogRow) => tokens(r.realName).at(-1) ?? tokens(r.name).at(-1);
  const kpSurname = bt.at(-1);
  const kpNick = st[0] ? compact(st[0]) : "";
  if (kpNick && kpSurname && kpSurname.length >= 5) {
    const hit = rows.filter((r) => {
      const nick = compact(tokens(r.name)[0] ?? "");
      return nick === kpNick && surnameOf(r) === kpSurname;
    });
    if (hit.length === 1) return { performerId: hit[0].id, via: "nickname" };
    if (hit.length > 1) return { performerId: null, via: "ambiguous", candidates: hit.map((r) => r.name) };
  }

  // Не нашли — но подскажем, на кого похоже: общая фамилия (последнее
  // слово настоящего имени) с кем-то из каталога. Это не совпадение, а
  // список для глаз владельца: заводить новую карточку или это тёзка.
  const surname = bt.at(-1) ?? (st.length >= 2 ? st.at(-1) : undefined);
  const similar =
    surname && surname.length >= 5
      ? rows.filter((r) => tokens(r.realName).includes(surname) || tokens(r.name).includes(surname))
      : [];
  return { performerId: null, via: "none", candidates: similar.slice(0, 5).map((r) => `${r.name}${r.realName ? ` (${r.realName})` : ""}`) };
}
