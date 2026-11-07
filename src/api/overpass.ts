/**
 * Overpass-Abfragen (OpenStreetMap). Die öffentlichen Server sind oft
 * ausgelastet – daher nacheinander mehrere Spiegel probieren.
 */
const SERVERS = [
  { url: 'https://overpass-api.de/api/interpreter', timeout: 15000 },
  { url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', timeout: 40000 },
  { url: 'https://overpass.private.coffee/api/interpreter', timeout: 25000 },
  { url: 'https://overpass.kumi.systems/api/interpreter', timeout: 25000 },
];

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const cache = new Map<string, Promise<OsmElement[]>>();
/** Server, der zuletzt geantwortet hat, zuerst fragen */
let preferred = 0;

async function run(query: string, signal?: AbortSignal): Promise<OsmElement[]> {
  let lastError = 'Keine Antwort';
  for (let k = 0; k < SERVERS.length; k++) {
    const idx = (preferred + k) % SERVERS.length;
    const s = SERVERS[idx];
    signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(s.timeout);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const res = await fetch(s.url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: combined });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const json = await res.json();
      preferred = idx;
      return json.elements as OsmElement[];
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = (e as Error).message;
    }
  }
  throw new Error(`OpenStreetMap-Abfrage gerade nicht möglich (${lastError}). Bitte später erneut versuchen.`);
}

export function overpass(query: string, signal?: AbortSignal): Promise<OsmElement[]> {
  let p = cache.get(query);
  if (!p) {
    p = run(query, signal);
    p.catch(() => cache.delete(query));
    cache.set(query, p);
  }
  return p;
}
