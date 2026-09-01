const CACHE = "an-nur-v4";
const ASSETS = ["/login", "/manifest.webmanifest", "/icon"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;

  const isDocument = req.mode === "navigate" || req.headers.get("accept")?.includes("text/html");

  event.respondWith(
    (async () => {
      if (isDocument) {
        try {
          const res = await fetch(req);
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const login = await caches.match("/login");
          if (login) return login;
          throw new Error("offline");
        }
      }

      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});
