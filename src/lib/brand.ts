/** Barcha do'konlarda bir xil ko'rinadigan mahsulot brendi. Faqat shu faylni o'zgartiring. */
export const PRODUCT_NAME = "An-Nur";
export const PRODUCT_TAGLINE = "do'kon kassasi";
export const PRODUCT_LOGO = "/brand/an-nur-logo.jpg";
export const SPLASH_SHOW_MS = 10_000;
export const SPLASH_FADE_MS = 10_000;
export const PRODUCT_DESCRIPTION =
  "Oziq-ovqat va ichimliklar do'koni uchun kassa, ombor va foyda hisobi";

export function productTitle() {
  return `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`;
}

export function productInitial() {
  return PRODUCT_NAME.charAt(0).toUpperCase();
}

export function productPrefix(text: string) {
  return `${PRODUCT_NAME} — ${text}`;
}
