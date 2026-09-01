"use client";

import { useEffect } from "react";

function isCloudHost() {
  const host = window.location.hostname;
  return host.endsWith(".railway.app") || host.endsWith(".onrender.com");
}

export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    if (isCloudHost()) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
