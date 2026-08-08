// Service Worker for Dulce Sabor CRM PWA
// Bumped version on every release so browsers fetch fresh assets.
const CACHE_NAME = "megapg-v5.36.1";
const ASSETS = ["/", "/index.html", "/manifest.json", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Skip Supabase API calls — let them go through directly without SW interference
  const url = event.request.url;
  if (url.includes(".supabase.co") || url.includes(".supabase.in")) return;

  // Network-first for HTML; cache-first for other assets
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/index.html")
      )
    );
    return;
  }
  // Endurecimiento preventivo: acotar la lectura de cache al CACHE_NAME
  // vigente (en vez de caches.match global, que busca en cualquier cache
  // del origen sin importar su nombre). Un bump de CACHE_NAME debe forzar
  // cache-miss real para todo, sin depender de si el nombre de archivo
  // hasheado por Vite cambia o no entre builds.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) =>
        cached || fetch(event.request).then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const respClone = resp.clone();
            cache.put(event.request, respClone);
          }
          return resp;
        })
      )
    )
  );
});
