const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R = L.map((p) => [...p].map((b) => (b === "1" ? "0" : "1")).join(""));
const G = R.map((p) => [...p].reverse().join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function eanCheckDigit(body: string) {
  // Weights run 3,1,3,... from the digit next to the check digit, for both EAN-8 and EAN-13.
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const fromRight = body.length - i;
    sum += Number(body[i]) * (fromRight % 2 === 1 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

export function normalizeEan(code: string | null | undefined) {
  const c = String(code || "").trim();
  if (/^\d{12}$/.test(c)) return `0${c}`;
  return c;
}

export function isPrintableEan(code: string | null | undefined) {
  const c = normalizeEan(code);
  if (!/^(\d{8}|\d{13})$/.test(c)) return false;
  return eanCheckDigit(c.slice(0, -1)) === c.slice(-1);
}

export function eanBits(code: string) {
  const c = normalizeEan(code);
  if (!isPrintableEan(c)) return null;
  if (c.length === 8) {
    const left = [...c.slice(0, 4)].map((d) => L[Number(d)]).join("");
    const right = [...c.slice(4)].map((d) => R[Number(d)]).join("");
    return `101${left}01010${right}101`;
  }
  const parity = PARITY[Number(c[0])];
  const left = [...c.slice(1, 7)].map((d, i) => (parity[i] === "L" ? L : G)[Number(d)]).join("");
  const right = [...c.slice(7)].map((d) => R[Number(d)]).join("");
  return `101${left}01010${right}101`;
}

export const STORE_BARCODE_PREFIX = "29";

export function storeBarcode(seq: number) {
  const body = `${STORE_BARCODE_PREFIX}${String(seq).padStart(10, "0")}`;
  return body + eanCheckDigit(body);
}
