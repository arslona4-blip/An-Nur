export type DisplayLine = { name: string; qty: number; unit: string; price: number; total: number };

export type DisplayState = {
  mode: "idle" | "cart" | "pay" | "done";
  lines: DisplayLine[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  change: number;
  method: string;
  at: number;
};

const CHANNEL = "annur-ekran";
const KEY = "annur-ekran-state";

let channel: BroadcastChannel | null = null;

function open() {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(CHANNEL);
  return channel;
}

export function publishDisplay(state: Omit<DisplayState, "at">) {
  const full = { ...state, at: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    /* xotira to'la */
  }
  open()?.postMessage({ type: "state", state: full });
}

export function lastDisplay(): DisplayState | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

// The till answers "hello" by publishing again, so a screen opened mid-sale catches up at once.
export function onDisplayHello(cb: () => void) {
  const ch = open();
  if (!ch) return () => {};
  const handler = (e: MessageEvent) => {
    if (e.data?.type === "hello") cb();
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}

export function subscribeDisplay(cb: (state: DisplayState) => void) {
  const ch = open();
  const onMsg = (e: MessageEvent) => {
    if (e.data?.type === "state") cb(e.data.state);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY && e.newValue) cb(JSON.parse(e.newValue));
  };
  ch?.addEventListener("message", onMsg);
  window.addEventListener("storage", onStorage);
  ch?.postMessage({ type: "hello" });
  return () => {
    ch?.removeEventListener("message", onMsg);
    window.removeEventListener("storage", onStorage);
  };
}
