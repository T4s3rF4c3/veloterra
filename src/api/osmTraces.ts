import { create } from 'zustand';
import type { LngLat } from '../domain/geo';
import { KINDS, aggregate, cellBbox, cellsFor, quarters, type Bbox, type Bins } from '../domain/traceGrid';
import { classifyTrace, cleanRuns, densityPoints, isBikeKind, type Trace, type TraceKind } from '../domain/traces';
import { dbAll, dbClear, dbPut } from './db';

/**
 * Öffentliche GPS-Spuren von OpenStreetMap, gespeichert in festen Kacheln
 * (0,1° × 0,1°). Einmal geladene Kacheln bleiben im Browser und sind bei
 * jedem Zoom sofort da. Geladen wird nur auf Knopfdruck, nacheinander und
 * mit wenigen Seiten – die OSM-Schnittstelle ist fürs Kartenbearbeiten
 * gedacht, nicht für Massenabfragen.
 */
const API = 'https://api.openstreetmap.org/api/0.6/trackpoints';
const PAGES = 3;
const PAGE_TIMEOUT = 18000;
const FIRST_PAGE_TIMEOUT = 12000;
/** höchstens so viele neue Kacheln auf einmal (ca. 35 × 45 km) */
export const MAX_CELLS = 20;

/** Format der gespeicherten Kacheln – ältere werden verworfen und neu geladen */
const CACHE_VERSION = 2;

interface CellRecord {
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

interface TracesState {
  /** gespeicherte Kacheln (nur Metadaten) */
  cells: Record<string, { at: number; partial: boolean }>;
  counts: Record<TraceKind, number>;
  loading: { done: number; total: number } | null;
  error: string | null;
  /** Hinweis, z. B. dass alte Kacheln neu geladen werden müssen */
  notice: string | null;
  version: number;
}

const ZERO = (): Record<TraceKind, number> => ({ foot: 0, bike: 0, fast: 0, motor: 0, unknown: 0 });

export const useTraces = create<TracesState>()(() => ({
  cells: {},
  counts: ZERO(),
  loading: null,
  error: null,
  notice: null,
  version: 0,
}));

const data = new Map<string, CellRecord>();

function publish() {
  const cells: TracesState['cells'] = {};
  const counts = ZERO();
  for (const c of data.values()) {
    cells[c.id] = { at: c.at, partial: c.partial };
    for (const k of KINDS) counts[k] += c.counts[k] ?? 0;
  }
  useTraces.setState((st) => ({ cells, counts, version: st.version + 1 }));
}

/** Für die Karte: alle gespeicherten Punkte als GeoJSON (Gewicht = Anzahl). */
export function traceFeatures(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const c of data.values()) {
    const b = c.bins;
    for (let i = 0; i < b.lng.length; i++) {
      features.push({
        type: 'Feature',
        properties: { k: KINDS[b.kind[i]], w: b.count[i] },
        geometry: { type: 'Point', coordinates: [b.lng[i], b.lat[i]] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Umrisse der gespeicherten Kacheln. */
export function cellOutlines(): LngLat[][] {
  return [...data.keys()].map((id) => {
    const [w, s, e, n] = cellBbox(id);
    return [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ];
  });
}

/** Beim Start: gespeicherte Kacheln laden. */
export async function loadTraceCache() {
  try {
    const all = await dbAll<CellRecord>('traces');
    const current = all.filter((c) => c.v === CACHE_VERSION);
    for (const c of current) data.set(c.id, c);
    if (current.length < all.length) {
      // alte Kacheln (ohne Bereinigung) verwerfen
      await dbClear('traces');
      if (current.length) await dbPut('traces', current);
      useTraces.setState({
        notice: `${all.length - current.length} gespeicherte Kacheln stammten aus einer älteren Version und wurden entfernt – bitte „Bereich laden“ erneut drücken.`,
      });
    }
  } catch {
    /* ohne Speicher eben leer */
  }
  publish();
}

function parsePage(xml: string): Trace[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const traces: Trace[] = [];
  for (const seg of Array.from(doc.getElementsByTagName('trkseg'))) {
    const points: LngLat[] = [];
    const times: number[] = [];
    let allTimed = true;
    for (const p of Array.from(seg.getElementsByTagName('trkpt'))) {
      const lat = Number(p.getAttribute('lat'));
      const lon = Number(p.getAttribute('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      points.push([lon, lat]);
      const t = p.getElementsByTagName('time')[0]?.textContent;
      const ms = t ? Date.parse(t) : NaN;
      if (Number.isFinite(ms)) times.push(ms);
      else allTimed = false;
    }
    if (points.length) traces.push({ points, times: allTimed && times.length === points.length ? times : null });
  }
  return traces;
}

/** Bis zu PAGES Seiten eines Bereichs. Wirft, wenn schon die erste Seite scheitert. */
async function fetchArea(b: Bbox, signal: AbortSignal): Promise<{ traces: Trace[]; partial: boolean }> {
  const box = b.map((v) => v.toFixed(5)).join(',');
  const traces: Trace[] = [];
  for (let page = 0; page < PAGES; page++) {
    const timeout = AbortSignal.timeout(page === 0 ? FIRST_PAGE_TIMEOUT : PAGE_TIMEOUT);
    try {
      const res = await fetch(`${API}?bbox=${box}&page=${page}`, { signal: AbortSignal.any([signal, timeout]) });
      if (!res.ok) throw new Error(`Fehler ${res.status}`);
      const pageTraces = parsePage(await res.text());
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
async function fetchCell(id: string, signal: AbortSignal): Promise<CellRecord> {
  let parts: { traces: Trace[]; partial: boolean }[];
  try {
    parts = [await fetchArea(cellBbox(id), signal)];
  } catch (e) {
    if (signal.aborted) throw e;
    parts = [];
    for (const q of quarters(cellBbox(id))) {
      try {
        parts.push(await fetchArea(q, signal));
      } catch (e2) {
        if (signal.aborted) throw e2;
        parts.push({ traces: [], partial: true });
      }
    }
    if (parts.every((p) => !p.traces.length)) throw e;
  }
  const counts = ZERO();
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

let ctrl: AbortController | null = null;

export function cancelTraces() {
  ctrl?.abort();
}

/** Kacheln eines Ausschnitts: wie viele sind schon gespeichert? */
export function regionStatus(view: Bbox) {
  const ids = cellsFor(view);
  const missing = ids.filter((id) => !data.has(id));
  return { total: ids.length, missing: missing.length };
}

/**
 * Fehlende Kacheln des Ausschnitts laden (mit `refresh` auch vorhandene neu).
 * Nacheinander, jede Kachel wird sofort gespeichert und angezeigt.
 */
export async function loadRegion(view: Bbox, refresh = false) {
  ctrl?.abort();
  const abort = new AbortController();
  ctrl = abort;
  const ids = cellsFor(view).filter((id) => refresh || !data.has(id));
  if (ids.length > MAX_CELLS) {
    useTraces.setState({
      error: `Bereich zu groß (${ids.length} Kacheln) – bitte hineinzoomen, höchstens ${MAX_CELLS} auf einmal.`,
    });
    return;
  }
  if (!ids.length) return;
  const failed: string[] = [];
  useTraces.setState({ loading: { done: 0, total: ids.length }, error: null, notice: null });
  for (let i = 0; i < ids.length; i++) {
    useTraces.setState({ loading: { done: i, total: ids.length } });
    try {
      const rec = await fetchCell(ids[i], abort.signal);
      if (abort.signal.aborted) break;
      data.set(rec.id, rec);
      await dbPut('traces', [rec]).catch(() => undefined);
      publish();
    } catch {
      if (abort.signal.aborted) break;
      failed.push(ids[i]);
    }
  }
  if (ctrl !== abort) return;
  ctrl = null;
  useTraces.setState({
    loading: null,
    error: failed.length
      ? `${failed.length} von ${ids.length} Kacheln konnten nicht geladen werden (OpenStreetMap-Server überlastet) – später nochmal „Bereich laden“.`
      : null,
  });
}

export async function clearTraceCache() {
  ctrl?.abort();
  data.clear();
  await dbClear('traces').catch(() => undefined);
  useTraces.setState({ loading: null, error: null });
  publish();
}
