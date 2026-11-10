/*
 * Veloterra Service Worker: schneller Start und Offline-Betrieb.
 *
 * - Seite (index.html): erst Netz, ohne Netz die zuletzt geladene Fassung
 * - gebaute Dateien (/assets, Hash im Namen): aus dem Cache
 * - Kartenkacheln und Schriften: aus dem Cache, im Hintergrund aktualisiert
 *   (höchstens ~4000 Kacheln, die ältesten fliegen raus)
 * - /api, Routing, Wetter, Overpass: immer live, nie gecacht
 *
 * Die zuletzt geplante Route liegt im Browser-Speicher der App und ist damit
 * auch offline sofort da.
 */
const VERSION = 'v2';
const SHELL = `vt-shell-${VERSION}`;
const ASSETS = `vt-assets-${VERSION}`;
const TILES = `vt-tiles-${VERSION}`;
const KEEP = [SHELL, ASSETS, TILES];
const MAX_TILES = 4000;
const MAX_ASSETS = 120;

const TILE_HOSTS = [
  'tiles.openfreemap.org',
  'server.arcgisonline.com',
  'geoservices.bayern.de',
  'www.gds-srv.hessen.de',
  'www.wms.nrw.de',
  'geo4.service24.rlp.de',
  'tile.waymarkedtrails.org',
  'gps.tile.openstreetmap.org',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/icon.svg', '/manifest.webmanifest']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('vt-') && !KEEP.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  // Einträge liegen in Einfüge-Reihenfolge vor – die ältesten zuerst löschen
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

let puts = 0;
async function put(name, req, res, max) {
  const c = await caches.open(name);
  await c.put(req, res);
  if (++puts % 50 === 0) await trim(name, max);
}

/** Netz zuerst (höchstens 4 s warten), sonst Cache */
async function networkFirst(req, cacheKey) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (res.ok) await cache.put(cacheKey ?? req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(cacheKey ?? req);
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(name, req, max) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await put(name, req, res.clone(), max);
  return res;
}

/** Cache sofort, im Hintergrund aus dem Netz auffrischen */
async function staleWhileRevalidate(name, req, max, event) {
  const hit = await caches.match(req);
  const update = fetch(req)
    .then(async (res) => {
      if (res.ok || res.type === 'opaque') await put(name, req, res.clone(), max);
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  const res = await update;
  return res ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Server-Anfragen und kurze Teilen-Links (/s/<id>, Weiterleitung vom Server) nie abfangen
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/brouter') || url.pathname.startsWith('/s/'))
      return;
    if (req.mode === 'navigate') {
      // alle Seitenaufrufe teilen sich die Startseite (Teilen-Links stehen im #)
      event.respondWith(networkFirst(req, '/'));
      return;
    }
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(ASSETS, req, MAX_ASSETS));
      return;
    }
    // config.js, Icons, Manifest
    event.respondWith(networkFirst(req));
    return;
  }

  if (TILE_HOSTS.includes(url.hostname)) event.respondWith(staleWhileRevalidate(TILES, req, MAX_TILES, event));
});
