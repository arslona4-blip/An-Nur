export function som(value: number | null | undefined) {
  const n = Math.round(Number(value) || 0);
  return `${new Intl.NumberFormat("ru-RU").format(n)} so'm`;
}

export function usd(value: number | null | undefined, rate = 12500) {
  const n = Number(value) || 0;
  const usdVal = rate ? n / rate : 0;
  return `$${usdVal.toFixed(2)}`;
}

export function dualPrice(somAmount: number, rate: number, enabled: boolean) {
  if (!enabled || !rate) return som(somAmount);
  return `${som(somAmount)} / ${usd(somAmount, rate)}`;
}

export function qty(value: number, unit = "dona") {
  const n = Number(value) || 0;
  const shown = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `${shown} ${unit}`;
}

export function tashkentDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function tashkentDateTime(iso: string) {
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function expiryLabel(daysLeft: number) {
  if (daysLeft < 0) return `Muddati o‘tgan (${Math.abs(daysLeft)} kun)`;
  if (daysLeft === 0) return "Bugun tugaydi";
  return `${daysLeft} kun`;
}

export function dayRange(dateStr?: string) {
  const day = dateStr || tashkentDate();
  const start = new Date(`${day}T00:00:00+05:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { day, start: start.toISOString(), end: end.toISOString() };
}

export function periodRange(from?: string, to?: string) {
  const startDay = from || tashkentDate();
  const endDay = to || tashkentDate();
  const start = new Date(`${startDay}T00:00:00+05:00`);
  const end = new Date(`${endDay}T00:00:00+05:00`);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString(), startDay, endDay };
}

export const PAYMENT_METHODS = [
  { id: "naqd", label: "Naqd" },
  { id: "uzcard", label: "Uzcard" },
  { id: "humo", label: "Humo" },
  { id: "otkazma", label: "O'tkazma" },
  { id: "usd", label: "USD (naqd)" },
  { id: "qarz", label: "Qarz" },
] as const;

export const UNITS = ["dona", "kg", "litr", "quti", "m"] as const;

export const EXPENSE_CATEGORIES = [
  "Ijara",
  "Kommunal",
  "Oylik",
  "Transport",
  "Soliq",
  "Taminot",
  "Boshqa",
] as const;

export function methodLabel(id: string) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label ?? id;
}
