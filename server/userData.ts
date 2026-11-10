/**
 * Daten je Konto: gespeicherte Routen (mit Etappen) und eigene Fahrten der
 * persönlichen Heatmap. Je Konto ein Ordner unter DATA_DIR/users/<id>.
 * Außerdem geteilte Routen (kurze Links) unter DATA_DIR/shares.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const VALID_ROUTE_ID = /^[a-zA-Z0-9_-]{1,40}$/;
export const VALID_TRACK_ID = /^[0-9.,|-]{5,80}$/;
export const VALID_SHARE_ID = /^[a-zA-Z0-9_-]{6,16}$/;
const MAX_ROUTES = 2000;
const MAX_TRACKS = 30000;

/** Gespeicherte Route (Aufbau wie im Browser, mindestens id/name/savedAt) */
export interface RouteMeta {
  id: string;
  name: string;
  savedAt: number;
  [k: string]: unknown;
}

interface RoutesFile {
  routes: Record<string, RouteMeta>;
  /** gelöschte Routen: id → Zeitpunkt (damit andere Geräte sie auch löschen) */
  deleted: Record<string, number>;
}

/** Fahrt der Heatmap; c = abwechselnd lng, lat */
export interface TrackJson {
  id: string;
  length: number;
  c: number[];
  start?: number;
  kind?: string;
  pace?: Record<string, [number, number]>;
}

const locks = new Map<string, Promise<unknown>>();

/** Änderungen an einer Datei nacheinander ausführen */
function locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, data: unknown) {
  await writeFile(`${path}.tmp`, JSON.stringify(data));
  await rename(`${path}.tmp`, path);
}

export class UserData {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private dir(uid: string) {
    return join(this.dataDir, 'users', uid);
  }

  private async ensure(uid: string) {
    await mkdir(join(this.dir(uid), 'legs'), { recursive: true });
  }

  /* ---------- Routen ---------- */

  private routesFile(uid: string) {
    return join(this.dir(uid), 'routes.json');
  }

  routes(uid: string): Promise<RoutesFile> {
    return readJson(this.routesFile(uid), { routes: {}, deleted: {} });
  }

  async legs(uid: string, id: string): Promise<unknown> {
    return readJson(join(this.dir(uid), 'legs', `${id}.json`), null);
  }

  putRoute(uid: string, route: RouteMeta, legs: unknown) {
    return locked(`routes:${uid}`, async () => {
      await this.ensure(uid);
      const f = await this.routes(uid);
      if (!f.routes[route.id] && Object.keys(f.routes).length >= MAX_ROUTES)
        throw new Error(`Höchstens ${MAX_ROUTES} Routen je Konto`);
      f.routes[route.id] = route;
      delete f.deleted[route.id];
      if (legs && typeof legs === 'object') await writeJson(join(this.dir(uid), 'legs', `${route.id}.json`), legs);
      await writeJson(this.routesFile(uid), f);
    });
  }

  deleteRoute(uid: string, id: string) {
    return locked(`routes:${uid}`, async () => {
      await this.ensure(uid);
      const f = await this.routes(uid);
      delete f.routes[id];
      f.deleted[id] = Date.now();
      // Merkliste der Löschungen klein halten (90 Tage reichen für alle Geräte)
      const old = Date.now() - 90 * 86400_000;
      for (const [k, t] of Object.entries(f.deleted)) if (t < old) delete f.deleted[k];
      await rm(join(this.dir(uid), 'legs', `${id}.json`), { force: true });
      await writeJson(this.routesFile(uid), f);
    });
  }

  /* ---------- Heatmap ---------- */

  private heatFile(uid: string) {
    return join(this.dir(uid), 'heat.json');
  }

  heat(uid: string): Promise<{ tracks: TrackJson[] }> {
    return readJson(this.heatFile(uid), { tracks: [] });
  }

  /** Fahrten hinzufügen bzw. ersetzen (gleiche id) */
  putTracks(uid: string, tracks: TrackJson[]) {
    return locked(`heat:${uid}`, async () => {
      await this.ensure(uid);
      const f = await this.heat(uid);
      const byId = new Map(f.tracks.map((t) => [t.id, t]));
      for (const t of tracks) byId.set(t.id, t);
      if (byId.size > MAX_TRACKS) throw new Error(`Höchstens ${MAX_TRACKS} Fahrten je Konto`);
      await writeJson(this.heatFile(uid), { tracks: [...byId.values()] });
      return byId.size;
    });
  }

  clearHeat(uid: string) {
    return locked(`heat:${uid}`, () => rm(this.heatFile(uid), { force: true }));
  }

  /** Umfang für die Kontenliste im Admin-Bereich */
  async stats(uid: string) {
    const [r, h] = await Promise.all([this.routes(uid), this.heat(uid)]);
    return { routes: Object.keys(r.routes).length, rides: h.tracks.length };
  }

  removeUser(uid: string) {
    return rm(this.dir(uid), { recursive: true, force: true });
  }

  /* ---------- geteilte Routen ---------- */

  private shareFile(id: string) {
    return join(this.dataDir, 'shares', `${id}.json`);
  }

  /** Vorschaubild eines Teilen-Links (JPEG) */
  shareImage(id: string) {
    return join(this.dataDir, 'shares', `${id}.jpg`);
  }

  async createShare(uid: string, data: unknown, image?: Buffer): Promise<string> {
    await mkdir(join(this.dataDir, 'shares'), { recursive: true });
    const id = randomBytes(6).toString('base64url');
    await writeJson(this.shareFile(id), { uid, createdAt: Date.now(), data });
    if (image) await writeFile(this.shareImage(id), image);
    return id;
  }

  async share(id: string): Promise<unknown> {
    const f = await readJson<{ data?: unknown } | null>(this.shareFile(id), null);
    return f?.data ?? null;
  }
}

/** Grobe Prüfung einer Fahrt aus dem Browser */
export function validTrack(t: unknown): t is TrackJson {
  const x = t as TrackJson;
  return (
    !!x &&
    typeof x.id === 'string' &&
    VALID_TRACK_ID.test(x.id) &&
    typeof x.length === 'number' &&
    Array.isArray(x.c) &&
    x.c.length >= 4 &&
    x.c.length % 2 === 0 &&
    x.c.length <= 40000 &&
    x.c.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    (x.start === undefined || typeof x.start === 'number') &&
    (x.kind === undefined || (typeof x.kind === 'string' && x.kind.length <= 20)) &&
    (x.pace === undefined ||
      (typeof x.pace === 'object' &&
        Object.values(x.pace).every(
          (v) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n)),
        )))
  );
}

export function validRoute(r: unknown): r is RouteMeta {
  const x = r as RouteMeta;
  return (
    !!x &&
    typeof x === 'object' &&
    typeof x.id === 'string' &&
    VALID_ROUTE_ID.test(x.id) &&
    typeof x.name === 'string' &&
    x.name.length <= 200 &&
    typeof x.savedAt === 'number' &&
    Array.isArray(x.waypoints)
  );
}
