"use client";

import { useEffect, useState } from "react";
import { toCyrillic } from "@/lib/translit";

const SCRIPT_KEY = "annur-script";
const BIG_KEY = "annur-big-text";
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "NOSCRIPT"]);
const ATTRS = ["placeholder", "title", "aria-label"];

function skip(node: Node | null): boolean {
  for (let el = node instanceof Element ? node : node?.parentElement; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName) || el.hasAttribute("data-latin")) return true;
  }
  return false;
}

function convertText(node: Text) {
  if (skip(node)) return;
  const next = toCyrillic(node.data);
  if (next !== node.data) node.data = next;
}

function convertTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return convertText(root as Text);
  if (!(root instanceof Element) || skip(root)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) convertText(n as Text);
  for (const el of [root, ...root.querySelectorAll("[placeholder],[title],[aria-label]")]) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) {
        const next = toCyrillic(v);
        if (next !== v) el.setAttribute(a, next);
      }
    }
  }
}

// React keeps writing Latin text into the DOM, so every change is converted again as it lands.
function startCyrillic() {
  convertTree(document.body);
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") convertText(m.target as Text);
      else if (m.type === "attributes") convertTree(m.target);
      else m.addedNodes.forEach(convertTree);
    }
  });
  obs.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  return () => obs.disconnect();
}

export function DisplayPrefsEffect() {
  useEffect(() => {
    document.documentElement.classList.toggle("big-text", localStorage.getItem(BIG_KEY) === "1");
    if (localStorage.getItem(SCRIPT_KEY) === "cyr") return startCyrillic();
  }, []);
  return null;
}

export function DisplayToggles({ dark }: { dark?: boolean }) {
  const [cyr, setCyr] = useState(false);
  const [big, setBig] = useState(false);

  useEffect(() => {
    setCyr(localStorage.getItem(SCRIPT_KEY) === "cyr");
    setBig(localStorage.getItem(BIG_KEY) === "1");
  }, []);

  const btn = `flex-1 rounded-lg px-2 py-1.5 text-xs font-bold ${
    dark ? "bg-white/10 text-white hover:bg-white/20" : "border border-line bg-white text-ink"
  }`;

  return (
    <div className="flex flex-wrap gap-1.5" data-latin>
      <button
        type="button"
        className={btn}
        title={cyr ? "Lotin yozuviga o'tish" : "Кирилл ёзувига ўтиш"}
        onClick={() => {
          localStorage.setItem(SCRIPT_KEY, cyr ? "lat" : "cyr");
          location.reload();
        }}
      >
        <span className="max-md:inline hidden lg:inline">{cyr ? "Lotin" : "Кирилл"}</span>
        <span className="hidden md:inline lg:hidden">{cyr ? "Lo" : "Ки"}</span>
      </button>
      <button
        type="button"
        className={`${btn} ${big ? (dark ? "!bg-white !text-brand-dark" : "!bg-brand !text-white") : ""}`}
        title={big ? "Oddiy yozuv" : "Katta yozuv"}
        onClick={() => {
          const next = !big;
          localStorage.setItem(BIG_KEY, next ? "1" : "0");
          document.documentElement.classList.toggle("big-text", next);
          setBig(next);
        }}
      >
        A+
      </button>
    </div>
  );
}
