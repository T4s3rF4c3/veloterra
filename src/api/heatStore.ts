import { gunzipSync, unzip } from 'fflate';
import { create } from 'zustand';
import { activityFormat, isOutdoorRide, parseActivity, stravaActivityTypes } from '../domain/activities';
import { cumulativeDistances, simplify, type LngLat } from '../domain/geo';
import { HeatIndex } from '../domain/heat';
import { dbAll, dbClear, dbPut } from './db';

/**
 * Persönliche Heatmap: eigene Fahrten, vereinfacht gespeichert in IndexedDB
 * (nur in diesem Browser – nichts wird hochgeladen).
 */
interface StoredTrack {
  id: string;
  /** abwechselnd lng, lat */
  coords: Float32Array;
  length: number;
}

interface HeatState {
  tracks: LngLat[][];
  km: number;
  index: HeatIndex | null;
  loaded: boolean;
  busy: { done: number; total: number } | null;
  /** zählt hoch, wenn sich die Fahrten ändern */
  version: number;
}

export const useHeat = create<HeatState>()(() => ({
  tracks: [],
  km: 0,
  index: null,
  loaded: false,
  busy: null,
  version: 0,
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
  useHeat.setState((st) => ({ tracks, km, index, loaded: true, version: st.version + 1 }));
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

export async function clearHeat() {
  await dbClear('heat');
  all = [];
  publish(all);
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
  const known = new Set(all.map((t) => t.id));
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
      const raw = parseActivity(fmt.format, fmt.gzip ? gunzipSync(data) : data);
      if (raw.length < 2) {
        result.skipped++;
        continue;
      }
      const coords = simplify(raw, 12);
      const dist = cumulativeDistances(coords);
      const length = dist[dist.length - 1];
      if (length < 500) {
        result.skipped++;
        continue;
      }
      const id = trackId(coords, length);
      if (known.has(id)) {
        result.duplicates++;
        continue;
      }
      known.add(id);
      fresh.push({ id, coords: Float32Array.from(coords.flat()), length });
      result.added++;
    } catch {
      result.failed++;
    }
  }
  if (fresh.length) {
    await dbPut('heat', fresh);
    all = [...all, ...fresh];
  }
  useHeat.setState({ busy: null });
  publish(all);
  return result;
}
