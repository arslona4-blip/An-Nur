// Pack size written in a product name: "Coca-Cola 1,5л", "Sut 0.9 L", "Choy 100gr", "Pepsi 500 ml".
const SIZE = /(\d+(?:[.,]\d+)?)\s*(ml|мл|l|lt|litr|liter|л|g|gr|gramm|г|гр|kg|кг)(?![\p{L}])/iu;

const UNIT: Record<string, { kind: "ml" | "g"; factor: number; label: string }> = {
  ml: { kind: "ml", factor: 1, label: "ml" },
  мл: { kind: "ml", factor: 1, label: "ml" },
  l: { kind: "ml", factor: 1000, label: "L" },
  lt: { kind: "ml", factor: 1000, label: "L" },
  litr: { kind: "ml", factor: 1000, label: "L" },
  liter: { kind: "ml", factor: 1000, label: "L" },
  л: { kind: "ml", factor: 1000, label: "L" },
  g: { kind: "g", factor: 1, label: "g" },
  gr: { kind: "g", factor: 1, label: "g" },
  gramm: { kind: "g", factor: 1, label: "g" },
  г: { kind: "g", factor: 1, label: "g" },
  гр: { kind: "g", factor: 1, label: "g" },
  kg: { kind: "g", factor: 1000, label: "kg" },
  кг: { kind: "g", factor: 1000, label: "kg" },
};

export function packSize(name: string): string | null {
  const m = SIZE.exec(name);
  if (!m) return null;
  const unit = UNIT[m[2].toLowerCase()];
  const amount = Math.round(Number(m[1].replace(",", ".")) * unit.factor);
  return amount > 0 ? `${amount}${unit.kind}` : null;
}

export const DRINK_SIZES = ["0.5 L", "1 L", "1.5 L", "2 L"];

export function isDrinkCategory(name: string | null | undefined) {
  return /ichimlik|напит|drink/i.test(name || "");
}

// "Coca-Cola 1 L" + "1.5 L" → "Coca-Cola 1.5 L"
export function withPackSize(name: string, size: string) {
  return `${name.replace(SIZE, " ").replace(/\s{2,}/g, " ").trim()} ${size}`.trim();
}

// "coca-cola 1,5л" → "coca-cola 1.5 L", so the sizes of one brand read the same way in the catalogue.
export function tidyPackSize(name: string): string {
  return name.replace(SIZE, (_all, amount: string, unit: string) => {
    const label = UNIT[unit.toLowerCase()].label;
    return `${amount.replace(",", ".")} ${label}`;
  });
}
