import type { LngLat } from './geo';
import { aggregate, cellBbox, quarters, type Bbox, type Bins } from './traceGrid';
import { classifyTrace, cleanRuns, densityPoints, isBikeKind, type Trace, type TraceKind } from './traces';

/**
 * Eine Kachel öffentlicher GPS-Spuren von OpenStreetMap laden und aufbereiten.
 * Gemeinsam für Browser und Veloterra-Server: ohne DOM, `fetch` wird übergeben.
 */

export const TRACKPOINTS_API = 'https://api.openstreetmap.org/api/0.6/trackpoints';

/** Format der gespeicherten Kacheln – ältere werden verworfen und neu geladen */
export const CACHE_VERSION = 2;

export interface CellRecord {
  v: number;
  id: string;
  /** geladen am (ms) */
  at: number;
  bins: Bins;
  /** Spuren je Art (gespeichert werden nur Rad-Spuren, die anderen nur gezählt) */
  counts: Record<TraceKind, number>;
  /** nicht vollständig (Server zu langsam, Seitenlimit erreicht) */
  partial: boolean;
}

export const zeroCounts = (): Record<TraceKind, number> => ({ foot: 0, bike: 0, fast: 0, motor: 0, unknown: 0 });

export interface FetchOptions {
  fetch: typeof fetch;
  /** höchstens so viele Seiten à 5000 Punkte je Bereich */
  pages: number;
  firstPageTimeout: number;
  pageTimeout: number;
  /** zusätzliche Kopfzeilen, z. B. eine Kennung des Servers */
  headers?: Record<string, string>;
  /** Pause vor jeder Anfrage (ms), um die OSM-Schnittstelle zu schonen */
  delay?: number;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (!ms) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });

/** GPX der Trackpoints-Schnittstelle lesen (gleichförmig erzeugt, daher ohne XML-Parser). */
export function parseTrackpoints(xml: string): Trace[] {
  const traces: Trace[] = [];
  for (const seg of xml.split(/<trkseg>/).slice(1)) {
    const end = seg.indexOf('</trkseg>');
    const body = end < 0 ? seg : seg.slice(0, end);
    const points: LngLat[] = [];
    const times: number[] = [];
    let allTimed = true;
    for (const m of body.matchAll(/<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g)) {
      const lat = Number(/\blat="([^"]+)"/.exec(m[1])?.[1]);
      const lon = Number(/\blon="([^"]+)"/.exec(m[1])?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      points.push([lon, lat]);
      const t = m[2] ? /<time>([^<]+)<\/time>/.exec(m[2])?.[1] : undefined;
      const ms = t ? Date.parse(t) : NaN;
      if (Number.isFinite(ms)) times.push(ms);
      else allTimed = false;
    }
    if (points.length) traces.push({ points, times: allTimed && times.length === points.length ? times : null });
  }
  return traces;
}

/** Bis zu `pages` Seiten eines Bereichs. Wirft, wenn schon die erste Seite scheitert. */
async function fetchArea(
  b: Bbox,
  signal: AbortSignal,
  o: FetchOptions,
): Promise<{ traces: Trace[]; partial: boolean }> {
  const box = b.map((v) => v.toFixed(5)).join(',');
  const traces: Trace[] = [];
  for (let page = 0; page < o.pages; page++) {
    await sleep(o.delay ?? 0, signal);
    const timeout = AbortSignal.timeout(page === 0 ? o.firstPageTimeout : o.pageTimeout);
    try {
      const res = await o.fetch(`${TRACKPOINTS_API}?bbox=${box}&page=${page}`, {
        signal: AbortSignal.any([signal, timeout]),
        headers: o.headers,
      });
      if (!res.ok) throw new Error(`Fehler ${res.status}`);
      const pageTraces = parseTrackpoints(await res.text());
      traces.push(...pageTraces);
      if (pageTraces.reduce((a, t) => a + t.points.length, 0) < 5000) return { traces, partial: false };
    } catch (e) {
      if (signal.aborted) throw e;
      if (page === 0) throw new Error(timeout.aborted ? 'Server zu langsam' : (e as Error).message);
      return { traces, partial: true };
    }
  }
  // Seitenlimit erreicht – es gäbe noch mehr Punkte
  return { traces, partial: true };
}

/** Eine Kachel laden; ist das Gebiet zu dicht, in Vierteln. */
export async function fetchCell(id: string, signal: AbortSignal, o: FetchOptions): Promise<CellRecord> {
  let parts: { traces: Trace[]; partial: boolean }[];
  try {
    parts = [await fetchArea(cellBbox(id), signal, o)];
  } catch (e) {
    if (signal.aborted) throw e;
    parts = [];
    for (const q of quarters(cellBbox(id))) {
      try {
        parts.push(await fetchArea(q, signal, o));
      } catch (e2) {
        if (signal.aborted) throw e2;
        parts.push({ traces: [], partial: true });
      }
    }
    if (parts.every((p) => !p.traces.length)) throw e;
  }
  const counts = zeroCounts();
  const points: { coord: LngLat; kind: TraceKind; trace: number }[] = [];
  let trace = 0;
  for (const p of parts) {
    for (const t of p.traces) {
      const kind = classifyTrace(t);
      counts[kind]++;
      trace++;
      // nur Radfahrten, und nur ihre plausiblen Stücke
      if (!isBikeKind(kind)) continue;
      for (const run of cleanRuns(t)) for (const coord of densityPoints(run)) points.push({ coord, kind, trace });
    }
  }
  return {
    v: CACHE_VERSION,
    id,
    at: Date.now(),
    bins: aggregate(points),
    counts,
    partial: parts.some((p) => p.partial),
  };
}

/* ---------- Übertragung als JSON (Veloterra-Server) ---------- */

/** Kachel mit den Typed Arrays als Base64 – verlustfrei und kompakt. */
export interface CellJson extends Omit<CellRecord, 'bins'> {
  bins: { lng: string; lat: string; kind: string; count: string };
}

function toBase64(a: ArrayBufferView): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(s: string): ArrayBuffer {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function cellToJson(rec: CellRecord): CellJson {
  const b = rec.bins;
  return {
    ...rec,
    bins: { lng: toBase64(b.lng), lat: toBase64(b.lat), kind: toBase64(b.kind), count: toBase64(b.count) },
  };
}

export function cellFromJson(j: CellJson): CellRecord {
  const b = j.bins;
  return {
    ...j,
    bins: {
      lng: new Float32Array(fromBase64(b.lng)),
      lat: new Float32Array(fromBase64(b.lat)),
      kind: new Uint8Array(fromBase64(b.kind)),
      count: new Uint16Array(fromBase64(b.count)),
    },
  };
}
