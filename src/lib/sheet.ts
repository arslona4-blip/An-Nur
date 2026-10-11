// Reads the first sheet of an .xlsx or a .csv file into rows of text, in the browser, without extra packages.

export async function readSheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(decodeText(buf));
  if (name.endsWith(".xls")) throw new Error("Eski .xls formati o‘qilmaydi. Excel’da «Saqlash» → «.xlsx» qilib saqlang.");
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error("Fayl .xlsx yoki .csv bo‘lishi kerak");
  return readXlsx(buf);
}

function decodeText(buf: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1251").decode(buf);
  }
}

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const delim = [";", "\t", ","].reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ",");
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

type ZipEntry = { method: number; size: number; offset: number };

function zipEntries(buf: Uint8Array) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Excel fayli buzilgan");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  const utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = utf8.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    entries.set(name, { method, size, offset: dataStart });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function unzipText(buf: Uint8Array, entries: Map<string, ZipEntry>, name: string) {
  const e = entries.get(name);
  if (!e) return null;
  const raw = buf.slice(e.offset, e.offset + e.size);
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new Error("Excel fayli siqish usuli qo‘llab-quvvatlanmaydi");
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

function xml(text: string) {
  return new DOMParser().parseFromString(text, "application/xml");
}

const byName = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS("*", tag));

async function readXlsx(buf: Uint8Array): Promise<string[][]> {
  const entries = zipEntries(buf);
  const shared: string[] = [];
  const sst = await unzipText(buf, entries, "xl/sharedStrings.xml");
  if (sst) {
    for (const si of byName(xml(sst), "si")) shared.push(byName(si, "t").map((t) => t.textContent || "").join(""));
  }

  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = await unzipText(buf, entries, "xl/workbook.xml");
  const rels = await unzipText(buf, entries, "xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const first = byName(xml(wb), "sheet")[0];
    const rid =
      first?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ||
      first?.getAttribute("r:id");
    const rel = byName(xml(rels), "Relationship").find((r) => r.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = await unzipText(buf, entries, sheetPath);
  if (!sheet) throw new Error("Excel faylida varaq topilmadi");

  const out: string[][] = [];
  for (const r of byName(xml(sheet), "row")) {
    const row: string[] = [];
    let next = 0;
    for (const c of byName(r, "c")) {
      const ref = c.getAttribute("r");
      const col = ref ? colIndex(ref) : next;
      next = col + 1;
      const type = c.getAttribute("t");
      const v = byName(c, "v")[0]?.textContent ?? "";
      let value = v;
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = byName(c, "t").map((t) => t.textContent || "").join("");
      while (row.length < col) row.push("");
      row[col] = value;
    }
    out.push(row);
  }
  return out;
}

function colIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
