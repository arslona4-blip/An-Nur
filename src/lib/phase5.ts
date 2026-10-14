import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { createCategory, getSettings, listCategories } from "./db";
import { UNITS } from "./format";
import { renderAdProductPng } from "./product-ad-card";
import { tidyPackSize } from "./volume";

const PHASE5 = "phase5-v1";

export function dataDir() {
  return process.env.ANNUR_DATA_DIR || path.join(process.cwd(), "data");
}

export function uploadsDir(...parts: string[]) {
  return path.join(dataDir(), "uploads", ...parts);
}

export function migratePhase5(db: DatabaseSync) {
  const has = (
    db.prepare(`SELECT COUNT(*) AS c FROM pragma_table_info('products') WHERE name = ?`).get("image_url") as {
      c: number;
    }
  ).c;
  if (!has) db.exec("ALTER TABLE products ADD COLUMN image_url TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_sessions (
      chat_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'idle',
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
  `);

  const defaults: Record<string, string> = {
    openai_api_key: "",
    telegram_bot_enabled: "0",
    telegram_webhook_secret: "",
    telegram_webhook_url: "",
    telegram_admin_ids: "",
    telegram_courier_ids: "",
    delivery_fee_default: "0",
  };
  const ins = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING");
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);

  fs.mkdirSync(uploadsDir("products"), { recursive: true });
  moveSugarToOwnCategory(db);
  splitFruitCategory(db);

  const ver = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get() as { value: string } | undefined;
  if (ver?.value === PHASE5) return;
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    "schema_version",
    PHASE5,
  );
}

const SUGAR_SQL = `(lower(name) LIKE '%shakar%' OR lower(name) LIKE '%novvot%' OR lower(name) LIKE '%navvot%'
  OR lower(name) LIKE '%nabot%' OR lower(name) LIKE '%rafinad%' OR name LIKE '%сахар%' OR name LIKE '%Сахар%'
  OR name LIKE '%нават%' OR name LIKE '%Нават%' OR name LIKE '%рафинад%' OR name LIKE '%Рафинад%'
  OR lower(name) = 'qand' OR lower(name) LIKE 'qand %' OR lower(name) LIKE '% qand' OR lower(name) LIKE '% qand %')`;

// Runs once: sugar used to live in "Yorma va yog'"; products the owner filed elsewhere by hand stay where they are.
function moveSugarToOwnCategory(db: DatabaseSync) {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'migr_qand_shakar'").get()) return;
  const yorma = (db.prepare("SELECT id, name FROM categories").all() as Array<{ id: number; name: string }>)
    .filter((c) => c.name.toLowerCase().replace(/['ʼ`‘’]/g, "").startsWith("yorma"))
    .map((c) => c.id);
  const from = `(category_id IS NULL${yorma.length ? ` OR category_id IN (${yorma.join(",")})` : ""})`;
  const ids = (db.prepare(`SELECT id FROM products WHERE ${SUGAR_SQL} AND ${from}`).all() as Array<{ id: number }>).map((r) => r.id);
  if (ids.length) {
    let cat = db.prepare("SELECT id FROM categories WHERE lower(name) = 'qand-shakar'").get() as { id: number } | undefined;
    if (!cat) {
      const sort = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM categories").get() as { s: number }).s;
      const info = db.prepare("INSERT INTO categories (name, color, sort) VALUES ('Qand-shakar', '#e11d48', ?)").run(sort);
      cat = { id: Number(info.lastInsertRowid) };
    }
    db.prepare(`UPDATE products SET category_id = ? WHERE id IN (${ids.join(",")})`).run(cat.id);
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('migr_qand_shakar', ?) ON CONFLICT(key) DO NOTHING").run(String(ids.length));
}

const FRUIT_PREFIX = ["olma", "banan", "apelsin", "mandarin", "uzum", "anor", "shaftoli", "olcha", "gilos", "qulupnay", "kivi", "xurmo", "ananas", "qovun", "tarvuz", "behi", "anjir", "meva"];
const FRUIT_WHOLE = ["nok", "limon"];
const FRUIT_SQL = `((${[
  ...FRUIT_PREFIX.map((w) => `lower(name) LIKE '${w}%' OR lower(name) LIKE '% ${w}%'`),
  ...FRUIT_WHOLE.map((w) => `lower(name) = '${w}' OR lower(name) LIKE '${w} %' OR lower(name) LIKE '% ${w}' OR lower(name) LIKE '% ${w} %'`),
].join(" OR ")}) AND NOT (lower(name) LIKE '%sharbat%' OR lower(name) LIKE '%sok%' OR lower(name) LIKE '%juice%'
  OR lower(name) LIKE '%choy%' OR lower(name) LIKE '%nektar%' OR lower(name) LIKE '%kompot%' OR lower(name) LIKE '%limonad%'))`;

// Runs once: "Sabzavot-meva" becomes "Sabzavot" and its fruit moves to "Mevalar"; hand-filed products elsewhere stay put.
function splitFruitCategory(db: DatabaseSync) {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'migr_mevalar'").get()) return;
  const cats = db.prepare("SELECT id, name FROM categories").all() as Array<{ id: number; name: string }>;
  const veg = cats.filter((c) => c.name.toLowerCase().startsWith("sabzavot")).map((c) => c.id);
  const mixed = cats.find((c) => c.name.toLowerCase() === "sabzavot-meva");
  if (mixed && !cats.some((c) => c.name.toLowerCase() === "sabzavot")) {
    db.prepare("UPDATE categories SET name = 'Sabzavot' WHERE id = ?").run(mixed.id);
  }
  const from = `(category_id IS NULL${veg.length ? ` OR category_id IN (${veg.join(",")})` : ""})`;
  const ids = (db.prepare(`SELECT id FROM products WHERE ${FRUIT_SQL} AND ${from}`).all() as Array<{ id: number }>).map((r) => r.id);
  if (ids.length) {
    let cat = db.prepare("SELECT id FROM categories WHERE lower(name) = 'mevalar'").get() as { id: number } | undefined;
    if (!cat) {
      const sort = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM categories").get() as { s: number }).s;
      const info = db.prepare("INSERT INTO categories (name, color, sort) VALUES ('Mevalar', '#ca8a04', ?)").run(sort);
      cat = { id: Number(info.lastInsertRowid) };
    }
    db.prepare(`UPDATE products SET category_id = ? WHERE id IN (${ids.join(",")})`).run(cat.id);
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('migr_mevalar', ?) ON CONFLICT(key) DO NOTHING").run(String(ids.length));
}

export function openaiKey() {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return getSettings().openai_api_key?.trim() || "";
}

export type RecognizedProduct = {
  name: string;
  unit: string;
  buy_price: number;
  sell_price: number;
  category_name: string | null;
  image_url: string;
  source_image_url?: string;
};

export function parseUzsPrice(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/so['ʼ']?m|сум|uzs|сумм/gi, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  // "10.000" / "2.500" O'zbek formatida minglik ajratuvchi
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return Math.round(Number(s.replace(/\./g, "")));
  }
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Math.round(Number(digits)) : 0;
}

export async function saveProductImageBuffer(buf: Buffer, ext = "png") {
  const name = `${randomUUID()}.${ext}`;
  const dir = uploadsDir("products");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  return `/api/media/products/${name}`;
}

export async function saveProductImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Faqat rasm fayli yuklash mumkin");
  if (file.size > 12 * 1024 * 1024) throw new Error("Rasm 12 MB dan katta bo‘lmasin");

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  const buf = Buffer.from(await file.arrayBuffer());
  return saveProductImageBuffer(buf, ext);
}

/** AI bergan [chap, yuqori, o‘ng, past] (0..1) bo‘yicha qirqadi; shubhali box bo‘lsa — butun rasm. */
async function cropToBox(source: Buffer, box: unknown): Promise<Buffer> {
  const image = sharp(source).rotate();
  if (!Array.isArray(box) || box.length !== 4) return image.png().toBuffer();
  const [x1, y1, x2, y2] = box.map(Number);
  const area = (x2 - x1) * (y2 - y1);
  const valid = [x1, y1, x2, y2].every(Number.isFinite) && 0 <= x1 && x1 < x2 && x2 <= 1 && 0 <= y1 && y1 < y2 && y2 <= 1;
  if (!valid || area < 0.03 || area > 0.95) return image.png().toBuffer();

  const { width = 0, height = 0 } = await sharp(await image.toBuffer()).metadata();
  const pad = 0.02;
  const left = Math.floor(Math.max(0, x1 - pad) * width);
  const top = Math.floor(Math.max(0, y1 - pad) * height);
  const right = Math.ceil(Math.min(1, x2 + pad) * width);
  const bottom = Math.ceil(Math.min(1, y2 + pad) * height);
  return sharp(source)
    .rotate()
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();
}

export async function buildAdProductImage(opts: {
  source: Buffer;
  box?: unknown;
  name: string;
  sellPrice: number;
  categoryName?: string | null;
}) {
  const cropped = await cropToBox(opts.source, opts.box);
  const png = await renderAdProductPng({
    image: cropped,
    mime: "image/png",
    name: opts.name,
    sellPrice: opts.sellPrice,
    categoryName: opts.categoryName,
  });
  return saveProductImageBuffer(png, "png");
}

type AiProduct = {
  name?: string;
  unit?: string;
  buy_price?: number | string;
  sell_price?: number | string;
  category_name?: string | null;
  box?: unknown;
};

export async function callVisionJson(opts: {
  key: string;
  mime: string;
  b64: string;
  prompt: string;
}) {
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: opts.prompt },
            { type: "image_url", image_url: { url: `data:${opts.mime};base64,${opts.b64}` } },
          ],
        },
      ],
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) {
    throw new Error(data.error?.message || "OpenAI so‘rovi muvaffaqiyatsiz");
  }

  const raw = data.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("AI javobini o‘qib bo‘lmadi");
  }
}

/** Nom bo‘yicha eng mos kategoriyani topish (Fanta → Ichimliklar) */
export function resolveCategoryName(
  productName: string,
  aiCategory: string | null | undefined,
  categories: string[],
): string | null {
  const lowerCats = categories.map((c) => ({ raw: c, key: c.toLowerCase().replace(/['ʼ`]/g, "") }));

  function findCat(...needles: string[]) {
    for (const n of needles) {
      const needle = n.toLowerCase().replace(/['ʼ`]/g, "");
      if (!needle) continue;
      const exact = lowerCats.find((c) => c.key === needle);
      if (exact) return exact.raw;
      const soft = lowerCats.find((c) => c.key.includes(needle) || needle.includes(c.key));
      if (soft) return soft.raw;
    }
    return null;
  }

  const n = productName.toLowerCase().replace(/['ʼ`‘’]/g, "");
  // short words only as whole words ("un" must not hit "universal"), longer ones as word prefixes
  const hasWord = (w: string, whole = w.length <= 3) =>
    new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${whole ? "(?![\\p{L}])" : ""}`, "u").test(n);

  // "whole" words never match as a prefix: "qand" is sugar, "qandolat" is confectionery.
  const rules: Array<{ cat: string[]; words: string[]; whole?: string[]; label: string }> = [
    {
      label: "Ichimliklar",
      cat: ["ichimliklar", "ichimlik", "drinks", "напитки"],
      words: [
        "fanta",
        "coca",
        "cola",
        "pepsi",
        "sprite",
        "seven up",
        "7up",
        "flash",
        "energetik",
        "suv",
        "water",
        "sok",
        "juice",
        "sharbat",
        "choy",
        "tea",
        "qahva",
        "coffee",
        "nescafe",
        "kompot",
        "ayron",
        "limonad",
        "ichimlik",
        "mirinda",
        "mountain dew",
        "red bull",
        "burn",
        "mineral",
        "gazlangan",
        "napitok",
      ],
    },
    {
      label: "Non",
      cat: ["non", "nonvoy", "bread"],
      words: ["non", "bulochka", "lavash", "baget", "bread", "lepyoshka", "patir"],
    },
    {
      label: "Mevalar",
      cat: ["mevalar", "meva", "фрукты"],
      words: [
        "olma",
        "banan",
        "apelsin",
        "mandarin",
        "uzum",
        "anor",
        "shaftoli",
        "orik",
        "olcha",
        "gilos",
        "qulupnay",
        "kivi",
        "xurmo",
        "ananas",
        "qovun",
        "tarvuz",
        "behi",
        "anjir",
        "meva",
        "яблок",
        "банан",
        "виноград",
        "фрукт",
      ],
      whole: ["nok", "limon"],
    },
    {
      label: "Sabzavot",
      cat: ["sabzavot", "овощи"],
      words: [
        "pomidor",
        "bodring",
        "kartoshka",
        "sabzi",
        "piyoz",
        "lavlagi",
        "qalampir",
        "baqlajon",
        "sarimsoq",
        "kashnich",
        "ukrop",
        "sabzavot",
        "овощ",
      ],
      whole: ["karam"],
    },
    {
      label: "Go'sht-tuxum",
      cat: ["go'sht-tuxum", "gosht", "go'sht", "мясо"],
      words: ["gosht", "go'sht", "mol", "qoy", "tovuq", "tuxum", "kolbasa", "sosiska", "farsh"],
    },
    {
      label: "Sut mahsulotlari",
      cat: ["sut mahsulotlari", "sut", "молоч"],
      words: ["sut", "qatiq", "yogurt", "pishloq", "sariyog", "smetana", "tvoroq", "kefir"],
    },
    {
      label: "Qand-shakar",
      cat: ["qand-shakar", "qand shakar", "shakar", "сахар"],
      words: ["shakar", "novvot", "navvot", "nabot", "rafinad", "сахар", "рафинад", "нават"],
      whole: ["qand", "қанд", "канд"],
    },
    {
      label: "Yorma va yog'",
      cat: ["yorma va yog'", "yorma", "yog", "крупа"],
      words: ["guruch", "un", "yog", "moy", "makaron", "grechka", "yorma", "tuz"],
    },
    {
      label: "Shirinlik",
      cat: ["shirinlik", "shirini", "слад"],
      words: ["shokolad", "konfet", "pechene", "vafli", "marmelad", "muzqaymoq", "tort"],
    },
    {
      label: "Gazaklar",
      cat: ["gazaklar", "gazak", "snek", "снеки", "shirinlik", "слад"],
      words: [
        "semechk",
        "семечк",
        "pista",
        "yongoq",
        "yong'oq",
        "арахис",
        "chips",
        "чипс",
        "kurt",
        "qurt",
        "suxarik",
        "сухарик",
        "kirieshki",
        "кириешки",
        "popkorn",
        "попкорн",
        "snack",
      ],
    },
    {
      label: "Kanselyariya",
      cat: ["kanselyariya", "kanstovar", "kanstovarlar", "stationery", "канц"],
      words: ["marker", "ruchka", "qalam", "daftar", "jurnal", "tetrad", "highlighter", "stapler", "skotch", "qogoz"],
    },
  ];

  for (const rule of rules) {
    if (rule.words.some((w) => hasWord(w.replace(/['ʼ`‘’]/g, ""))) || rule.whole?.some((w) => hasWord(w, true))) {
      const hit = findCat(...rule.cat, rule.label);
      if (hit) return hit;
      const fresh = listCategories().find((c) => c.name.toLowerCase() === rule.label.toLowerCase());
      if (fresh) return fresh.name;
      createCategory(rule.label);
      return rule.label;
    }
  }

  if (aiCategory?.trim()) return findCat(aiCategory.trim());
  return null;
}

function normalizeProduct(parsed: AiProduct, categories: string[]): Omit<RecognizedProduct, "image_url"> {
  const name = tidyPackSize(String(parsed.name || "").trim());
  if (!name) throw new Error("Mahsulot nomi aniqlanmadi — boshqa rasm sinab ko‘ring");

  let unit = String(parsed.unit || "dona").toLowerCase();
  if (!UNITS.includes(unit as (typeof UNITS)[number])) unit = "dona";

  const sell = parseUzsPrice(parsed.sell_price);
  let buy = parseUzsPrice(parsed.buy_price);
  if (!sell && !buy) {
    throw new Error(`«${name}» uchun narx topilmadi — rasmda yoki yozuvda narx bo‘lsin`);
  }
  const sell_price = sell || Math.round(buy * 1.25);
  if (!buy) buy = Math.round(sell_price / 1.2);
  if (buy > sell_price) buy = Math.round(sell_price * 0.8);

  const category_name = resolveCategoryName(name, parsed.category_name, categories);

  return { name, unit, buy_price: buy, sell_price, category_name };
}

export async function recognizeProductFromImage(
  file: File,
  opts?: { caption?: string },
): Promise<{ products: RecognizedProduct[] }> {
  const key = openaiKey();
  if (!key) {
    throw new Error("OpenAI API kaliti sozlanmagan — Sozlamalar → AI mahsulot");
  }

  const source_image_url = await saveProductImage(file);
  const abs = path.join(uploadsDir("products"), path.basename(source_image_url));
  const b64 = fs.readFileSync(abs).toString("base64");
  const mime = file.type || "image/jpeg";
  const categories = listCategories().map((c) => c.name);
  const unitList = UNITS.join(", ");
  const caption = opts?.caption?.trim() || "";

  const prompt = `Siz O‘zbekiston chakana do‘koni uchun mahsulot katalog AI sisiz.
Kiruvchi: Telegram/WhatsApp skrinshoti yoki mahsulot fotosi.

${caption ? `Qo‘shimcha matn (caption):\n${caption}\n` : ""}

Vazifa: rasmda KO‘RINADIGAN HAR BIR alohida mahsulotni ajrating.
FAQAT JSON:
{
  "products": [
    {
      "name": "qisqa savdo nomi: brend + mahsulot + hajm/og‘irlik (Coca-Cola 1.5 L)",
      "unit": "dona|kg|litr|quti|m",
      "buy_price": 0,
      "sell_price": 8000,
      "category_name": "quyidagi ro‘yxatdan ANIQ bitta nom yoki null",
      "box": [0.1, 0.05, 0.9, 0.4]
    }
  ]
}

MAVJUD TOIFALAR (faqat shulardan birini yozing, boshqa nom ixtiro qilmang):
${categories.length ? categories.map((c) => `- ${c}`).join("\n") : "- (toifa yo‘q)"}

Toifa misollari:
- Fanta, Coca-Cola, Pepsi, Sprite, suv, sok, choy, qahva → Ichimliklar (yoki ro‘yxatdagi ichimlik toifasi)
- Non, bulochka, lavash → Non
- Pomidor, sabzi, kartoshka → Sabzavot
- Olma, uzum, banan, anor → Mevalar
- Sut, yogurt, pishloq → Sut mahsulotlari
- Go'sht, tuxum, kolbasa → Go'sht-tuxum
- Qand, shakar, novvot, rafinad → Qand-shakar
- Guruch, un, yog‘, makaron → Yorma va yog‘
- Shokolad, konfet, pechene → Shirinlik
- Semechka, chips, yong‘oq, pista, qurt, suxarik → Gazaklar (yoki Shirinlik)
- Marker, daftar, ruchka → Kanselyariya (agar bor bo‘lsa)

Qoidalar:
- category_name — mahsulot turiga MOS toifa. Ro‘yxatda mosi bo‘lmasa null yozing; oziq-ovqatni hech qachon kanselyariya, xo‘jalik kabi boshqa turdagi toifaga qo‘ymang.
- Hajm yoki og‘irlik (0.5 L, 1 L, 1.5 L, 2 L, 500 ml, 100 g, 1 kg) yorliqda, idishda yoki yozuvda ko‘rinsa — nomga ALBATTA qo‘shing. Bir brendning har xil hajmi — ALOHIDA mahsulot, har biri o‘z narxi bilan.
- Hajm aniq ko‘rinmasa, taxmin qilmang — nomga hajm yozmang.
- Shisha, banka, quti, paketdagi mahsulot unit = "dona". "litr"/"kg" faqat to‘kib yoki tortib sotiladigan mahsulot uchun.
- sell_price: rasm/stiker/captiondagi CHAKANA narx (so‘m). "2.500" = 2500, "10 000" = 10000.
- buy_price noma’lum bo‘lsa 0.
- box — shu mahsulot fotosining rasmdagi joyi [chap, yuqori, o‘ng, past], 0..1 ulushda. Chat yozuvlari va boshqa mahsulot kirmasin.
- Chat UI / username / vaqt NI mahsulot deb o‘qimang.
- unit faqat: ${unitList}.
- Kamida 1 ta mahsulot qaytaring.`;

  const parsed = await callVisionJson({ key, mime, b64, prompt });
  const list = Array.isArray(parsed.products)
    ? (parsed.products as AiProduct[])
    : parsed.name
      ? [parsed as AiProduct]
      : [];

  if (!list.length) throw new Error("Mahsulot topilmadi — aniqroq rasm yuboring");

  const source = fs.readFileSync(abs);
  const products: RecognizedProduct[] = [];
  for (const item of list) {
    const base = normalizeProduct(item, categories);
    const image_url = await buildAdProductImage({
      source,
      box: item.box,
      name: base.name,
      sellPrice: base.sell_price,
      categoryName: base.category_name,
    });
    products.push({ ...base, image_url, source_image_url });
  }

  return { products };
}

export type ListedProduct = Omit<RecognizedProduct, "image_url" | "source_image_url"> & { stock: number };

/** Telefon/kompyuter mikrofonidan yozilgan ovoz → matn (Safari o‘zbekchani o‘zi tanimaydi) */
export async function transcribeAudio(file: File): Promise<string> {
  const key = openaiKey();
  if (!key) throw new Error("OpenAI API kaliti sozlanmagan — Sozlamalar → AI mahsulot");
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const hint = "Do‘kon mahsulotlari ro‘yxati: Coca-Cola 1,5 litr 14 ming, 24 ta. Non 4 ming, 30 ta. Shakar 1 kilo 13 ming.";

  async function run(model: string) {
    const form = new FormData();
    form.append("file", file, file.name || "ovoz.webm");
    form.append("model", model);
    form.append("language", "uz");
    form.append("prompt", hint);
    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
    return { ok: res.ok, status: res.status, text: String(data.text || "").trim(), error: data.error?.message };
  }

  let r = await run("gpt-4o-mini-transcribe");
  if (!r.ok && (r.status === 400 || r.status === 404)) r = await run("whisper-1");
  if (!r.ok) throw new Error(r.error || "Ovozni matnga o‘girib bo‘lmadi");
  return r.text;
}

/** Ovozdan kelgan xom matn → har qatorda bitta mahsulot: "Coca-Cola 1,5 L, 14 000 so‘m, 24 ta" */
export async function tidyDictation(text: string): Promise<{ lines: string[] }> {
  const key = openaiKey();
  if (!key) throw new Error("OpenAI API kaliti sozlanmagan — Sozlamalar → AI mahsulot");
  const clean = text.trim().slice(0, 6000);
  if (!clean) return { lines: [] };

  const prompt = `Do‘kon egasi mahsulotlarini ovoz bilan aytdi, brauzer uni matnga o‘girdi (xatolar, pauzadagi nuqtalar, takrorlar bor).
Uni toza ro‘yxatga aylantiring: HAR BIR MAHSULOT ALOHIDA QATOR, ko‘rinishi: "Nomi hajmi, narxi so‘m, miqdori".
- Faqat lotin harflari. Kirillni lotinga o‘giring.
- Brend nomlarini rasmiy imlosida yozing: "koka kola" → "Coca-Cola", "pepsi" → "Pepsi", "fanta" → "Fanta", "sprayt" → "Sprite", "nestle" → "Nestle", "lipton" → "Lipton", "ariyel" → "Ariel", "snikers" → "Snickers".
- Sonlarni faqat raqam bilan: "bir yarim litr" yoki "1. Yarim litr" → "1,5 L"; "yarim litr" → "0,5 L"; "o‘n to‘rt ming" yoki "14. Mingdan" → "14 000 so‘m"; "yigirma to‘rtta" → "24 ta"; "5 kilo" → "5 kg".
- Pauzada bo‘lingan bo‘laklarni bitta mahsulotga birlashtiring; ketma-ket takrorlangan nomni bir marta yozing.
- "a", "i", "xo‘sh", "yana", "keyin" kabi so‘zlarni va mahsulotga aloqasi yo‘q gaplarni tashlang.
- Aytilmagan narx yoki miqdorni o‘ylab topmang — o‘sha qismni yozmang. Oxirgi mahsulot chala bo‘lsa ham borini yozing.
FAQAT JSON: {"lines":["Coca-Cola 1,5 L, 14 000 so‘m, 24 ta","Non, 4 000 so‘m, 25 ta"]}

Matn:
"""
${clean}
"""`;

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) throw new Error(data.error?.message || "OpenAI so‘rovi muvaffaqiyatsiz");
  let parsed: { lines?: unknown[] };
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  } catch {
    throw new Error("AI javobini o‘qib bo‘lmadi");
  }
  const lines = (parsed.lines || []).map((l) => String(l ?? "").trim()).filter(Boolean).slice(0, 200);
  return { lines };
}

/** Yozilgan yoki aytilgan ro‘yxatdan mahsulotlar: "Coca-Cola 1.5 l 14 ming 20 ta, non 4000" */
export async function parseProductList(text: string): Promise<{ products: ListedProduct[] }> {
  const key = openaiKey();
  if (!key) throw new Error("OpenAI API kaliti sozlanmagan — Sozlamalar → AI mahsulot");
  const clean = text.trim().slice(0, 6000);
  if (!clean) throw new Error("Ro‘yxatni yozing yoki ayting");
  const categories = listCategories().map((c) => c.name);

  const prompt = `Siz O‘zbekiston chakana do‘koni uchun mahsulot kiritish yordamchisisiz.
Quyidagi matn — do‘kon egasi yozgan yoki ovoz bilan aytgan mahsulotlar ro‘yxati (ovozdan matnga o‘tishda xatolar bo‘lishi mumkin).
Ovozli matn uzluksiz bo‘lishi, pauzalarda bo‘linib ketishi mumkin: mahsulotlarni qator yoki nuqtaga emas, MA’NOGA qarab ajrating.
- Bo‘lingan bo‘laklarni birlashtiring: "Koka kola. 1 yarim litr. 14 ming" — bitta mahsulot.
- Ketma-ket takrorlangan nomni bir marta oling.
- Mahsulotga aloqasi yo‘q gaplar, so‘z-to‘ldiruvchilar va tushunarsiz bo‘laklarni ("a", "i", "xo‘sh", "yana", "keyin") tashlab yuboring.
- Nomi aniq bo‘lmagan bo‘lakdan mahsulot yasamang.
Har bir mahsulotni ajrating. FAQAT JSON:
{"products":[{"name":"Coca-Cola 1.5 L","unit":"dona","buy_price":0,"sell_price":14000,"stock":20,"category_name":"Ichimliklar"}]}

Qoidalar:
- name: qisqa savdo nomi, brend + mahsulot + hajm/og‘irlik. Imlo xatolarini tuzating, bosh harf bilan yozing ("koka kola bir yarim litr" → "Coca-Cola 1.5 L").
- Narxlar so‘mda: "14 ming" = 14000, "14 000 so‘m" = 14000, "2,5 ming" = 2500, "o‘n ikki ming besh yuz" = 12500, "1.2 mln" = 1200000.
- Bitta narx aytilsa — bu sotish narxi (sell_price). "olish/kelish/tan narxi" — buy_price, "sotish" — sell_price. Noma’lum narx 0.
- stock: "20 ta", "5 kilo", "3 quti", "yigirmata" — miqdor. Aytilmasa 0.
- unit faqat: ${UNITS.join(", ")}. Shisha, banka, paket, dona sotiladigan — "dona"; tortib sotiladigan (kilo) — "kg"; to‘kib sotiladigan — "litr".
- Hajm (0.5 L, 1 L, 1.5 L, 2 L) yoki og‘irlik aytilsa nomga qo‘shing; aytilmasa o‘ylab topmang.
- category_name: quyidagi ro‘yxatdan ANIQ bitta nom yoki null. Oziq-ovqatni kanselyariyaga qo‘ymang.
MAVJUD TOIFALAR:
${categories.length ? categories.map((c) => `- ${c}`).join("\n") : "- (toifa yo‘q)"}

Matn:
"""
${clean}
"""`;

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) throw new Error(data.error?.message || "OpenAI so‘rovi muvaffaqiyatsiz");
  let parsed: { products?: Array<AiProduct & { stock?: number | string }> };
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  } catch {
    throw new Error("AI javobini o‘qib bo‘lmadi");
  }

  const products: ListedProduct[] = [];
  for (const item of parsed.products || []) {
    const name = tidyPackSize(String(item.name || "").trim());
    if (!name) continue;
    let unit = String(item.unit || "dona").toLowerCase();
    if (!UNITS.includes(unit as (typeof UNITS)[number])) unit = "dona";
    const sell = parseUzsPrice(item.sell_price);
    let buy = parseUzsPrice(item.buy_price);
    const sell_price = sell || (buy ? Math.round(buy * 1.25) : 0);
    if (!buy && sell_price) buy = Math.round(sell_price / 1.2);
    if (buy > sell_price && sell_price) buy = Math.round(sell_price * 0.8);
    const stock = Math.max(0, Number(String(item.stock ?? 0).replace(",", ".")) || 0);
    products.push({ name, unit, buy_price: buy, sell_price, stock, category_name: resolveCategoryName(name, item.category_name, categories) });
  }
  if (!products.length) throw new Error("Ro‘yxatdan mahsulot topilmadi — nomi va narxini aniqroq yozing");
  return { products };
}