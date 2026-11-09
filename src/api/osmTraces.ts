import { create } from 'zustand';
import type { LngLat } from '../domain/geo';
import { CACHE_VERSION, fetchCell, zeroCounts, type CellRecord } from '../domain/traceCell';
import { KINDS, cellBbox, cellsFor, type Bbox } from '../domain/traceGrid';
import type { TraceKind } from '../domain/traces';
import { dbAll, dbClear, dbPut } from './db';
import { serverTraceCells, serverTraceIndex, useSite } from './site';

/**
 * Öffentliche GPS-Spuren von OpenStreetMap, gespeichert in festen Kacheln
 * (0,1° × 0,1°). Einmal geladene Kacheln bleiben im Browser und sind bei
 * jedem Zoom sofort da. Geladen wird nur auf Knopfdruck, nacheinander und
 * mit wenigen Seiten – die OSM-Schnittstelle ist fürs Kartenbearbeiten
 * gedacht, nicht für Massenabfragen. Hat der Veloterra-Server eine Kachel
 * schon vorab geladen (Admin), kommt sie von dort.
 */
const PAGES = 3;
const PAGE_TIMEOUT = 18000;
const FIRST_PAGE_TIMEOUT = 12000;
/** höchstens so viele neue Kacheln auf einmal (ca. 35 × 45 km) */
export const MAX_CELLS = 20;

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

const ZERO = zeroCounts;

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
  if (!refresh) await syncFromServer(view);
  if (ctrl !== abort) return;
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
      const rec = await fetchCell(ids[i], abort.signal, {
        fetch: (...a) => fetch(...a),
        pages: PAGES,
        firstPageTimeout: FIRST_PAGE_TIMEOUT,
        pageTimeout: PAGE_TIMEOUT,
      });
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

let serverIndex: Promise<Map<string, { at: number; partial: boolean }>> | null = null;

/**
 * Vom Veloterra-Server vorab geladene Kacheln des Ausschnitts übernehmen:
 * die, die hier fehlen oder dort neuer sind. Ohne Server passiert nichts.
 */
export async function syncFromServer(view: Bbox) {
  if (!useSite.getState().available) return;
  serverIndex ??= serverTraceIndex().catch(() => new Map());
  const index = await serverIndex;
  const ids = cellsFor(view).filter((id) => {
    const s = index.get(id);
    const local = data.get(id);
    return s && (!local || local.at < s.at);
  });
  for (let i = 0; i < ids.length; i += 40) {
    try {
      const recs = (await serverTraceCells(ids.slice(i, i + 40))).filter((r) => r.v === CACHE_VERSION);
      for (const r of recs) data.set(r.id, r);
      await dbPut('traces', recs).catch(() => undefined);
      publish();
    } catch {
      return;
    }
  }
}

/** Nach einem Lauf im Admin: Übersicht des Servers neu holen. */
export function refreshServerIndex() {
  serverIndex = null;
}

export async function clearTraceCache() {
  ctrl?.abort();
  data.clear();
  await dbClear('traces').catch(() => undefined);
  useTraces.setState({ loading: null, error: null });
  publish();
}
