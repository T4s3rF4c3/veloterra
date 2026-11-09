/**
 * Veloterra-Server: Admin-Login, seitenweite Einstellungen und vorab geladene
 * öffentliche GPS-Spuren. Läuft als eigener Docker-Dienst; nginx leitet /api
 * hierher weiter. Nur Node-Bordmittel, Daten als JSON-Dateien in DATA_DIR.
 *
 *   ADMIN_PASSWORD  Passwort für den Admin-Bereich (ohne: Anmeldung gesperrt)
 *   DATA_DIR        Ablage für Einstellungen und Kacheln (Standard ./data-api)
 *   PORT            Standard 8787
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { CACHE_VERSION, cellToJson, fetchCell, type CellJson } from '../src/domain/traceCell';
import { cellsFor, type Bbox } from '../src/domain/traceGrid';

const PORT = Number(process.env.PORT) || 8787;
const DATA_DIR = process.env.DATA_DIR || './data-api';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const TRACE_DIR = join(DATA_DIR, 'traces');
const CONFIG_FILE = join(DATA_DIR, 'config.json');
const SESSION_DAYS = 30;
/** größte Region je Lauf (Bayern ≈ 1600 Kacheln) */
const MAX_JOB_CELLS = 4000;
const USER_AGENT = 'Veloterra/1.0 (selbst gehosteter Routenplaner; laedt GPS-Spuren einmalig fuer alle Nutzer)';

/* ---------- Einstellungen ---------- */

interface SiteConfig {
  mapillaryToken: string;
  brouterUrl: string;
  overpassUrl: string;
}

let config: SiteConfig = { mapillaryToken: '', brouterUrl: '', overpassUrl: '' };

async function loadConfig() {
  try {
    config = { ...config, ...JSON.parse(await readFile(CONFIG_FILE, 'utf8')) };
  } catch {
    /* noch keine Einstellungen */
  }
}

const isUrl = (v: string) => v === '' || /^https?:\/\/[^\s]+$/i.test(v) || /^\/[^\s]*$/.test(v);

/* ---------- Anmeldung ---------- */

const sessions = new Map<string, number>();
const failures = new Map<string, number[]>();
const digest = (s: string) => createHash('sha256').update(s).digest();

function cookies(req: IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((p) => p.length === 2),
  );
}

function isAdmin(req: IncomingMessage): boolean {
  const token = cookies(req).vt_admin;
  const until = token ? sessions.get(token) : undefined;
  if (!until) return false;
  if (until < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

const clientIp = (req: IncomingMessage) =>
  (req.headers['x-real-ip'] as string) || req.socket.remoteAddress || 'unbekannt';

/** höchstens 8 Fehlversuche je Adresse in 15 Minuten */
function tooManyAttempts(ip: string): boolean {
  const recent = (failures.get(ip) ?? []).filter((t) => t > Date.now() - 15 * 60_000);
  failures.set(ip, recent);
  return recent.length >= 8;
}

function sessionCookie(req: IncomingMessage, value: string, maxAge: number) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `vt_admin=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

/* ---------- GPS-Spuren ---------- */

const fileOf = (id: string) => join(TRACE_DIR, `${id.replace(':', '_')}.json`);
const VALID_ID = /^-?\d{1,4}:-?\d{1,4}$/;
const index = new Map<string, { at: number; partial: boolean; size: number }>();

async function loadIndex() {
  await mkdir(TRACE_DIR, { recursive: true });
  for (const f of await readdir(TRACE_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const rec = JSON.parse(await readFile(join(TRACE_DIR, f), 'utf8')) as CellJson;
      if (rec.v !== CACHE_VERSION) continue;
      index.set(rec.id, { at: rec.at, partial: rec.partial, size: (await stat(join(TRACE_DIR, f))).size });
    } catch {
      /* kaputte Datei überspringen */
    }
  }
}

interface Job {
  running: boolean;
  label: string;
  total: number;
  done: number;
  failed: number;
  skipped: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

let job: Job | null = null;
let jobAbort: AbortController | null = null;

async function runJob(ids: string[], refresh: boolean, signal: AbortSignal) {
  const j = job!;
  let streak = 0;
  for (const id of ids) {
    if (signal.aborted) break;
    if (!refresh && index.has(id)) {
      j.skipped++;
      j.done++;
      continue;
    }
    try {
      const rec = await fetchCell(id, signal, {
        fetch,
        pages: 3,
        firstPageTimeout: 30_000,
        pageTimeout: 45_000,
        headers: { 'User-Agent': USER_AGENT },
        // OSM-Schnittstelle schonen: eine Anfrage nach der anderen, mit Pause
        delay: 1500,
      });
      const text = JSON.stringify(cellToJson(rec));
      await writeFile(fileOf(id), text);
      index.set(id, { at: rec.at, partial: rec.partial, size: text.length });
      streak = 0;
    } catch (e) {
      if (signal.aborted) break;
      j.failed++;
      // mehrere Fehler hintereinander: OSM ist überlastet – länger warten
      if (++streak >= 3) await new Promise((r) => setTimeout(r, 60_000));
      j.error = (e as Error).message;
    }
    j.done++;
  }
  j.running = false;
  j.finishedAt = Date.now();
  if (signal.aborted) j.error = 'abgebrochen';
  else if (!j.failed) j.error = null;
  jobAbort = null;
}

/* ---------- HTTP ---------- */

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new Error('JSON erwartet');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) throw new Error('Anfrage zu groß');
    chunks.push(c as Buffer);
  }
  const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (typeof v !== 'object' || v === null) throw new Error('Ungültige Anfrage');
  return v;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.replace(/^\/api/, '');
  const m = req.method ?? 'GET';
  const admin = isAdmin(req);

  if (m === 'GET' && path === '/session') return send(res, 200, { admin, loginEnabled: !!PASSWORD, config });

  if (m === 'POST' && path === '/login') {
    const ip = clientIp(req);
    if (!PASSWORD) return send(res, 403, { error: 'Auf dem Server ist kein Admin-Passwort gesetzt.' });
    if (tooManyAttempts(ip)) return send(res, 429, { error: 'Zu viele Versuche – bitte in 15 Minuten erneut.' });
    const { password } = await readBody(req);
    if (typeof password !== 'string' || !timingSafeEqual(digest(password), digest(PASSWORD))) {
      failures.get(ip)!.push(Date.now());
      return send(res, 401, { error: 'Passwort falsch' });
    }
    const token = randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_DAYS * 86400_000);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
  }

  if (m === 'POST' && path === '/logout') {
    const token = cookies(req).vt_admin;
    if (token) sessions.delete(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (m === 'GET' && path === '/traces/index')
    return send(res, 200, { cells: [...index].map(([id, c]) => [id, c.at, c.partial ? 1 : 0]) });

  if (m === 'GET' && path === '/traces/cells') {
    const ids = (url.searchParams.get('ids') ?? '')
      .split(',')
      .filter((id) => VALID_ID.test(id) && index.has(id))
      .slice(0, 60);
    const cells = await Promise.all(ids.map(async (id) => JSON.parse(await readFile(fileOf(id), 'utf8'))));
    return send(res, 200, { cells }, { 'Cache-Control': 'no-cache' });
  }

  // ab hier nur angemeldet
  if (!admin) return send(res, 401, { error: 'Bitte anmelden' });

  if (m === 'PUT' && path === '/config') {
    const body = await readBody(req);
    const next = { ...config };
    for (const k of ['mapillaryToken', 'brouterUrl', 'overpassUrl'] as const) {
      if (body[k] === undefined) continue;
      const v = String(body[k]).trim();
      if (v.length > 300) return send(res, 400, { error: 'Eintrag zu lang' });
      if (k !== 'mapillaryToken' && !isUrl(v))
        return send(res, 400, { error: 'Bitte eine Adresse mit http:// oder https:// angeben' });
      next[k] = v;
    }
    config = next;
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    return send(res, 200, { config });
  }

  if (m === 'GET' && path === '/traces/job') {
    let bytes = 0;
    for (const c of index.values()) bytes += c.size;
    return send(res, 200, { job, stored: index.size, bytes });
  }

  if (m === 'POST' && path === '/traces/job') {
    if (job?.running) return send(res, 409, { error: 'Es läuft bereits ein Ladevorgang.' });
    const { bbox, label, refresh } = await readBody(req);
    const b = bbox as Bbox;
    const valid =
      Array.isArray(b) &&
      b.length === 4 &&
      b.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      b[0] < b[2] &&
      b[1] < b[3] &&
      b[0] >= -180 &&
      b[2] <= 180 &&
      b[1] >= -85 &&
      b[3] <= 85;
    if (!valid) return send(res, 400, { error: 'Ungültiger Bereich' });
    const ids = cellsFor(b);
    if (ids.length > MAX_JOB_CELLS)
      return send(res, 400, { error: `Bereich zu groß (${ids.length} Kacheln, höchstens ${MAX_JOB_CELLS})` });
    job = {
      running: true,
      label: String(label || 'Bereich').slice(0, 60),
      total: ids.length,
      done: 0,
      failed: 0,
      skipped: 0,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
    };
    jobAbort = new AbortController();
    void runJob(ids, !!refresh, jobAbort.signal);
    return send(res, 200, { job });
  }

  if (m === 'DELETE' && path === '/traces/job') {
    jobAbort?.abort();
    return send(res, 200, { ok: true });
  }

  if (m === 'DELETE' && path === '/traces') {
    if (job?.running) return send(res, 409, { error: 'Erst den laufenden Ladevorgang abbrechen.' });
    await rm(TRACE_DIR, { recursive: true, force: true });
    await mkdir(TRACE_DIR, { recursive: true });
    index.clear();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Unbekannte Anfrage' });
}

await mkdir(DATA_DIR, { recursive: true });
await loadConfig();
await loadIndex();

createServer((req, res) => {
  handle(req, res).catch((e: Error) => send(res, 400, { error: e.message || 'Fehler' }));
}).listen(PORT, () => {
  console.log(
    `veloterra-api: Port ${PORT}, Daten in ${DATA_DIR}, ${index.size} Kacheln, Anmeldung ${PASSWORD ? 'aktiv' : 'gesperrt (ADMIN_PASSWORD fehlt)'}`,
  );
});
