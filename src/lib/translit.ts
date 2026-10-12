const SINGLE: Record<string, string> = {
  a: "а", b: "б", d: "д", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м", n: "н",
  o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", x: "х", y: "й", z: "з", e: "е",
};
const IOTATED: Record<string, string> = { o: "ё", u: "ю", a: "я", e: "е" };
const VOWELS = "aeiou";
const APOS = "'‘’ʻʼ`";
// Links, e-mails and letter+digit tokens (admin123, F9, 1.5l) are matched whole and left untouched.
const TOKEN = /\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+|(?:[A-Za-z]+\d|\d+[A-Za-z])[A-Za-z\d]*|[A-Za-z][A-Za-z'‘’ʻʼ`]*/g;

const isApos = (ch: string | undefined) => !!ch && APOS.includes(ch);
const isUpper = (ch: string) => ch !== ch.toLowerCase();

function convertWord(word: string) {
  // Brand names and abbreviations (Coca-Cola, UZS, F9) read better left as they are.
  if (/c(?!h)|w/i.test(word) || /^[A-Z]{2,4}$/.test(word)) return word;
  const allCaps = word.length > 1 && word === word.toUpperCase();
  let out = "";
  for (let i = 0; i < word.length; i++) {
    const raw = word[i];
    const c = raw.toLowerCase();
    const next = word[i + 1]?.toLowerCase();
    let piece: string;
    if ((c === "s" || c === "c") && next === "h") {
      piece = c === "s" ? "ш" : "ч";
      i++;
    } else if ((c === "o" || c === "g") && isApos(word[i + 1])) {
      piece = c === "o" ? "ў" : "ғ";
      i++;
    } else if (c === "y" && next && IOTATED[next] && !(next === "o" && isApos(word[i + 2]))) {
      piece = IOTATED[next];
      i++;
    } else if (c === "e") {
      const prev = word[i - 1]?.toLowerCase();
      piece = !prev || VOWELS.includes(prev) ? "э" : "е";
    } else if (isApos(raw)) {
      piece = /[A-Za-z]/.test(word[i + 1] || "") ? "ъ" : raw;
    } else {
      piece = SINGLE[c] ?? raw;
    }
    out += allCaps || isUpper(raw) ? (allCaps ? piece.toUpperCase() : piece[0].toUpperCase() + piece.slice(1)) : piece;
  }
  return out;
}

export function toCyrillic(text: string) {
  return text.replace(TOKEN, (token) => (/^[A-Za-z][A-Za-z'‘’ʻʼ`]*$/.test(token) ? convertWord(token) : token));
}
