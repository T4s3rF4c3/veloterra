import { gunzipSync, unzip } from 'fflate';
import { create } from 'zustand';
import { activityFormat, isOutdoorRide, parseActivityTrack, stravaActivityTypes } from '../domain/activities';
import { cumulativeDistances, simplify, type LngLat } from '../domain/geo';
import { HeatIndex } from '../domain/heat';
import { paceFromTrack, rideKind, type PaceStats } from '../domain/pace';
import { dbAll, dbClear, dbPut } from './db';

/**
 * Persönliche Heatmap: eigene Fahrten, vereinfacht gespeichert in IndexedDB.
 * Mit Konto auf dem Veloterra-Server werden sie dorthin synchronisiert
 * (siehe sync.ts), sonst bleiben sie in diesem Browser.
 */
export interface StoredTrack {
  id: string;
  /** abwechselnd lng, lat */
  coords: Float32Array;
  length: number;
  /** Startzeit (ms), falls bekannt */
  start?: number;
  /** Fahrtart aus dem Strava-Export (ride, gravel, mtb, ebike) */
  kind?: string;
  /** Meter und Sekunden je Steigungsklasse (persönliches Tempo) */
  pace?: PaceStats;
}

/** Fahrt im Format des Servers (Koordinaten auf ~1 m gerundet) */
export interface TrackJson {
  id: string;
  length: number;
  c: number[];
  start?: number;
  kind?: string;
  pace?: PaceStats;
}

export const trackToJson = (t: StoredTrack): TrackJson => ({
  id: t.id,
  length: Math.round(t.length),
  c: Array.from(t.coords, (n) => Math.round(n * 1e5) / 1e5),
  ...(t.start ? { start: t.start } : {}),
  ...(t.kind ? { kind: t.kind } : {}),
  ...(t.pace ? { pace: t.pace } : {}),
});

export const trackFromJson = (j: TrackJson): StoredTrack => ({
  id: j.id,
  length: j.length,
  coords: Float32Array.from(j.c),
  ...(j.start ? { start: j.start } : {}),
  ...(j.kind ? { kind: j.kind } : {}),
  ...(j.pace ? { pace: j.pace } : {}),
});

interface HeatState {
  tracks: LngLat[][];
  km: number;
  index: HeatIndex | null;
  loaded: boolean;
  busy: { done: number; total: number } | null;
  /** zählt hoch, wenn sich die Fahrten ändern */
  version: number;
  /** Tempo-Daten der Fahrten (für das persönliche Tempo) */
  paces: { pace?: PaceStats; kind?: string; start?: number }[];
}

export const useHeat = create<HeatState>()(() => ({
  tracks: [],
  km: 0,
  index: null,
  loaded: false,
  busy: null,
  version: 0,
  paces: [],
}));

const toCoords = (f: Float32Array): LngLat[] => {
  const out: LngLat[] = [];
  for (let i = 0; i < f.length; i += 2) out.push([f[i], f[i + 1]]);
  return out;
};

function publish(stored: StoredTrack[]) {
  const tracks = stored.map((s) => toCoords(s.coords));
  const index = new HeatIndex();
  for (const t of tracks) index.add(t);
  const km = stored.reduce((a, s) => a + s.length, 0) / 1000;
  const paces = stored.filter((s) => s.pace).map((s) => ({ pace: s.pace, kind: s.kind, start: s.start }));
  useHeat.setState((st) => ({ tracks, km, index, paces, loaded: true, version: st.version + 1 }));
}

let all: StoredTrack[] = [];

/** Beim Start: gespeicherte Fahrten laden. */
export async function loadHeat() {
  try {
    all = await dbAll<StoredTrack>('heat');
  } catch {
    all = [];
  }
  publish(all);
}

/** Alle Fahrten dieses Browsers */
export const heatTracks = () => all;

/** Fahrten hinzufügen bzw. ersetzen (gleiche id) – z. B. vom Server */
export async function putHeatTracks(tracks: StoredTrack[]) {
  if (!tracks.length) return;
  await dbPut('heat', tracks);
  const byId = new Map(all.map((t) => [t.id, t]));
  for (const t of tracks) byId.set(t.id, t);
  all = [...byId.values()];
  publish(all);
}

/** Nur in diesem Browser löschen (Konto-Wechsel, Löschen auf dem Server übernimmt sync.ts) */
export async function clearLocalHeat() {
  await dbClear('heat');
  all = [];
  publish(all);
}

/** Wird von sync.ts gesetzt: löscht die Fahrten auch im Konto */
let clearRemote: (() => Promise<unknown>) | null = null;
export const onClearHeat = (fn: typeof clearRemote) => (clearRemote = fn);

export async function clearHeat() {
  if (clearRemote) await clearRemote();
  await clearLocalHeat();
}

const trackId = (c: LngLat[], length: number) =>
  `${c[0][0].toFixed(4)},${c[0][1].toFixed(4)}|${c[c.length - 1][0].toFixed(4)},${c[c.length - 1][1].toFixed(4)}|${Math.round(length / 100)}`;

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) =>
    unzip(data, { filter: (f) => /\.(gpx|tcx|fit)(\.gz)?$|activities\.csv$/i.test(f.name) }, (err, res) =>
      err ? reject(err) : resolve(res),
    ),
  );
}

export interface ImportResult {
  added: number;
  duplicates: number;
  skipped: number;
  failed: number;
}

/**
 * Dateien übernehmen: Strava-Datenexport (ZIP) oder einzelne GPX/TCX/FIT
 * (auch .gz). Beim Strava-Export werden nur Radfahrten im Freien übernommen.
 */
export async function importActivities(files: File[]): Promise<ImportResult> {
  const entries: { name: string; data: Uint8Array }[] = [];
  let types: Map<string, string> | null = null;
  for (const f of files) {
    const data = new Uint8Array(await f.arrayBuffer());
    if (/\.zip$/i.test(f.name)) {
      const z = await unzipAsync(data);
      for (const [name, d] of Object.entries(z)) {
        if (/activities\.csv$/i.test(name)) types = stravaActivityTypes(new TextDecoder().decode(d));
        else entries.push({ name, data: d });
      }
    } else {
      entries.push({ name: f.name, data });
    }
  }

  const result: ImportResult = { added: 0, duplicates: 0, skipped: 0, failed: 0 };
  const known = new Map(all.map((t) => [t.id, t]));
  const fresh: StoredTrack[] = [];
  useHeat.setState({ busy: { done: 0, total: entries.length } });
  for (let i = 0; i < entries.length; i++) {
    const { name, data } = entries[i];
    // dem Browser zwischendurch Luft lassen (Fortschritt anzeigen)
    if (i % 20 === 0) {
      useHeat.setState({ busy: { done: i, total: entries.length } });
      await new Promise((r) => setTimeout(r, 0));
    }
    const fmt = activityFormat(name);
    const type = types?.get(name.replace(/^.*\//, ''));
    if (!fmt || (types && type !== undefined && !isOutdoorRide(type))) {
      result.skipped++;
      continue;
    }
    try {
      const raw = parseActivityTrack(fmt.format, fmt.gzip ? gunzipSync(data) : data);
      if (raw.coords.length < 2) {
        result.skipped++;
        continue;
      }
      const coords = simplify(raw.coords, 12);
      const dist = cumulativeDistances(coords);
      const length = dist[dist.length - 1];
      if (length < 500) {
        result.skipped++;
        continue;
      }
      const id = trackId(coords, length);
      const old = known.get(id);
      const pace = paceFromTrack(raw) ?? undefined;
      // schon vorhanden – Tempo-Daten aber nachtragen, falls sie bisher fehlten
      if (old && (old.pace || !pace)) {
        result.duplicates++;
        continue;
      }
      const start = raw.time.find(Number.isFinite);
      const track: StoredTrack = {
        id,
        coords: Float32Array.from(coords.flat()),
        length,
        ...(start ? { start } : {}),
        ...(rideKind(type) ? { kind: rideKind(type) } : {}),
        ...(pace ? { pace } : {}),
      };
      known.set(id, track);
      fresh.push(track);
      if (old) result.duplicates++;
      else result.added++;
    } catch {
      result.failed++;
    }
  }
  useHeat.setState({ busy: null });
  if (fresh.length) await putHeatTracks(fresh);
  return result;
}
