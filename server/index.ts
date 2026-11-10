/**
 * Veloterra-Server: Benutzerkonten mit Sync (Routen, eigene Heatmap),
 * seitenweite Einstellungen, geteilte Routen und vorab geladene öffentliche
 * GPS-Spuren. Läuft als eigener Docker-Dienst; nginx leitet /api hierher
 * weiter. Nur Node-Bordmittel, Daten als JSON-Dateien in DATA_DIR.
 *
 *   ADMIN_PASSWORD  Passwort des Admin-Kontos (ohne: kein Admin aus der Umgebung)
 *   ADMIN_USER      Benutzername des Admin-Kontos (Standard admin)
 *   DATA_DIR        Ablage für Einstellungen, Konten und Kacheln (Standard ./data-api)
 *   PORT            Standard 8787
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { CACHE_VERSION, cellToJson, fetchCell, type CellJson } from '../src/domain/traceCell';
import { cellsFor, type Bbox } from '../src/domain/traceGrid';
import { Accounts, ENV_ADMIN_ID, type Role, type User } from './accounts';
import { UserData, VALID_ROUTE_ID, VALID_SHARE_ID, validRoute, validTrack, type TrackJson } from './userData';

const PORT = Number(process.env.PORT) || 8787;
const DATA_DIR = process.env.DATA_DIR || './data-api';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_USER = (process.env.ADMIN_USER || 'admin').trim() || 'admin';
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

const accounts = new Accounts(DATA_DIR, PASSWORD, ADMIN_USER, SESSION_DAYS);
const userData = new UserData(DATA_DIR);
const failures = new Map<string, number[]>();
const COOKIE = 'vt_session';

function cookies(req: IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((p) => p.length === 2),
  );
}

const clientIp = (req: IncomingMessage) =>
  (req.headers['x-real-ip'] as string) || req.socket.remoteAddress || 'unbekannt';

/**
 * Höchstens 8 Fehlversuche je Adresse und 40 insgesamt in 15 Minuten. Die
 * Gesamtgrenze greift auch, wenn jemand den Server direkt anspricht und die
 * Adresse (X-Real-IP) bei jedem Versuch fälscht.
 */
function tooManyAttempts(ip: string): boolean {
  const since = Date.now() - 15 * 60_000;
  let total = 0;
  for (const [key, times] of failures) {
    const recent = times.filter((t) => t > since);
    if (recent.length) failures.set(key, recent);
    else failures.delete(key);
    total += recent.length;
  }
  if (!failures.has(ip)) failures.set(ip, []);
  return failures.get(ip)!.length >= 8 || total >= 40;
}

function sessionCookie(req: IncomingMessage, value: string, maxAge: number) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
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

/** JSON-Anfrage lesen; limit in Bytes (Standard 64 KB, Sync größer) */
async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<Record<string, unknown>> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new Error('JSON erwartet');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('Anfrage zu groß');
    chunks.push(c as Buffer);
  }
  const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (typeof v !== 'object' || v === null) throw new Error('Ungültige Anfrage');
  return v;
}

const MB = 1024 * 1024;
const pub = (u: User | null) => (u ? Accounts.toPublic(u) : null);

/** Konto, Routen, Heatmap und geteilte Routen */
async function handleAccount(
  req: IncomingMessage,
  res: ServerResponse,
  m: string,
  path: string,
  user: User | null,
): Promise<boolean> {
  const token = cookies(req)[COOKIE];

  if (m === 'POST' && path === '/login') {
    const ip = clientIp(req);
    if (!accounts.loginEnabled)
      return (
        send(res, 403, { error: 'Auf dem Server ist weder ein Admin-Passwort noch ein Konto eingerichtet.' }),
        true
      );
    if (tooManyAttempts(ip))
      return (send(res, 429, { error: 'Zu viele Versuche – bitte in 15 Minuten erneut.' }), true);
    const { username, password } = await readBody(req);
    const u =
      typeof password === 'string'
        ? await accounts.verify(typeof username === 'string' ? username : '', password)
        : null;
    if (!u) {
      failures.get(ip)!.push(Date.now());
      return (send(res, 401, { error: 'Benutzername oder Passwort falsch' }), true);
    }
    const t = await accounts.startSession(u.id);
    send(res, 200, { user: pub(u) }, { 'Set-Cookie': sessionCookie(req, t, SESSION_DAYS * 86400) });
    return true;
  }

  if (m === 'POST' && path === '/logout') {
    await accounts.endSession(token);
    return (send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) }), true);
  }

  // geteilte Route öffnen – ohne Anmeldung
  const shareImg = path.match(/^\/shares\/([^/]+)\/image\.jpg$/);
  if (m === 'GET' && shareImg) {
    if (!VALID_SHARE_ID.test(shareImg[1])) return (send(res, 404, { error: 'Unbekannt' }), true);
    try {
      const img = await readFile(userData.shareImage(shareImg[1]));
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800' });
      res.end(img);
    } catch {
      send(res, 404, { error: 'Kein Vorschaubild' });
    }
    return true;
  }

  const shareGet = path.match(/^\/shares\/([^/]+)$/);
  if (m === 'GET' && shareGet) {
    const data = VALID_SHARE_ID.test(shareGet[1]) ? await userData.share(shareGet[1]) : null;
    if (!data) return (send(res, 404, { error: 'Diese geteilte Route gibt es nicht (mehr).' }), true);
    return (send(res, 200, { data }, { 'Cache-Control': 'private, max-age=3600' }), true);
  }

  if (!path.startsWith('/me') && path !== '/shares') return false;
  if (!user) return (send(res, 401, { error: 'Bitte anmelden' }), true);
  const uid = user.id;

  if (m === 'POST' && path === '/shares') {
    const { data, image } = await readBody(req, 6 * MB);
    if (!data || typeof data !== 'object') return (send(res, 400, { error: 'Ungültige Route' }), true);
    // Vorschaubild (JPEG, höchstens 1,5 MB) – optional
    let jpg: Buffer | undefined;
    if (typeof image === 'string' && /^[A-Za-z0-9+/=]+$/.test(image)) {
      const b = Buffer.from(image, 'base64');
      if (b.length <= 1.5 * MB && b[0] === 0xff && b[1] === 0xd8) jpg = b;
    }
    return (send(res, 200, { id: await userData.createShare(uid, data, jpg) }), true);
  }

  if (m === 'PUT' && path === '/me/password') {
    const { current, next } = await readBody(req);
    if (user.id === ENV_ADMIN_ID)
      return (send(res, 400, { error: 'Das Admin-Passwort wird über ADMIN_PASSWORD im Container geändert.' }), true);
    const ip = clientIp(req);
    if (tooManyAttempts(ip))
      return (send(res, 429, { error: 'Zu viele Versuche – bitte in 15 Minuten erneut.' }), true);
    if (typeof current !== 'string' || !(await accounts.verify(user.name, current))) {
      failures.get(ip)!.push(Date.now());
      return (send(res, 401, { error: 'Bisheriges Passwort falsch' }), true);
    }
    await accounts.update(uid, { password: String(next ?? '') }, accounts.sessionKey(token));
    return (send(res, 200, { ok: true }), true);
  }

  /* Routen */
  if (m === 'GET' && path === '/me/routes') {
    const f = await userData.routes(uid);
    return (send(res, 200, { routes: Object.values(f.routes), deleted: f.deleted }), true);
  }
  const routeMatch = path.match(/^\/me\/routes\/([^/]+)$/);
  if (routeMatch) {
    const id = routeMatch[1];
    if (!VALID_ROUTE_ID.test(id)) return (send(res, 400, { error: 'Ungültige Route' }), true);
    if (m === 'GET') return (send(res, 200, { legs: await userData.legs(uid, id) }), true);
    if (m === 'PUT') {
      const { route, legs } = await readBody(req, 8 * MB);
      if (!validRoute(route) || route.id !== id) return (send(res, 400, { error: 'Ungültige Route' }), true);
      await userData.putRoute(uid, route, legs);
      return (send(res, 200, { ok: true }), true);
    }
    if (m === 'DELETE') {
      await userData.deleteRoute(uid, id);
      return (send(res, 200, { ok: true }), true);
    }
  }

  /* eigene Heatmap */
  if (m === 'GET' && path === '/me/heat/ids') {
    const { tracks } = await userData.heat(uid);
    return (send(res, 200, { ids: tracks.map((t) => [t.id, t.pace ? 1 : 0]) }), true);
  }
  if (m === 'POST' && path === '/me/heat/fetch') {
    const { ids } = await readBody(req, MB);
    const want = new Set(Array.isArray(ids) ? ids.slice(0, 1000).map(String) : []);
    const { tracks } = await userData.heat(uid);
    return (send(res, 200, { tracks: tracks.filter((t) => want.has(t.id)) }), true);
  }
  if (m === 'POST' && path === '/me/heat') {
    const { tracks } = await readBody(req, 16 * MB);
    if (!Array.isArray(tracks) || tracks.length > 1000 || !tracks.every(validTrack))
      return (send(res, 400, { error: 'Ungültige Fahrten' }), true);
    return (send(res, 200, { stored: await userData.putTracks(uid, tracks as TrackJson[]) }), true);
  }
  if (m === 'DELETE' && path === '/me/heat') {
    await userData.clearHeat(uid);
    return (send(res, 200, { ok: true }), true);
  }

  return false;
}

/** Konten verwalten (nur Admin) */
async function handleUsers(req: IncomingMessage, res: ServerResponse, m: string, path: string, me: User) {
  if (m === 'GET' && path === '/users') {
    const users = await Promise.all(
      accounts
        .list()
        .map(async (u) => ({ ...Accounts.toPublic(u), createdAt: u.createdAt, ...(await userData.stats(u.id)) })),
    );
    return (send(res, 200, { users }), true);
  }
  if (m === 'POST' && path === '/users') {
    const { name, password, role } = await readBody(req);
    const u = await accounts.create(String(name ?? ''), String(password ?? ''), role === 'admin' ? 'admin' : 'user');
    return (send(res, 200, { user: Accounts.toPublic(u) }), true);
  }
  const one = path.match(/^\/users\/([a-zA-Z0-9]+)$/);
  if (one) {
    const id = one[1];
    if (m === 'PUT') {
      const { password, role } = await readBody(req);
      if (id === me.id && role === 'user')
        return (send(res, 400, { error: 'Du kannst dir selbst nicht die Admin-Rechte nehmen.' }), true);
      const patch: { password?: string; role?: Role } = {};
      if (password !== undefined) patch.password = String(password);
      if (role === 'admin' || role === 'user') patch.role = role;
      const u = await accounts.update(id, patch);
      return (send(res, 200, { user: Accounts.toPublic(u) }), true);
    }
    if (m === 'DELETE') {
      if (id === me.id) return (send(res, 400, { error: 'Das eigene Konto kann nicht gelöscht werden.' }), true);
      await accounts.remove(id);
      await userData.removeUser(id);
      return (send(res, 200, { ok: true }), true);
    }
  }
  return false;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Kurzer Teilen-Link /s/<id>: eine kleine Seite mit Vorschau-Angaben (Open
 * Graph) für Messenger und soziale Netze, die sofort zur Route weiterleitet.
 */
async function sharePage(req: IncomingMessage, res: ServerResponse, id: string) {
  const data = VALID_SHARE_ID.test(id)
    ? ((await userData.share(id)) as { meta?: { title?: string; description?: string } } | null)
    : null;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'http')
    .split(',')[0]
    .trim();
  const base = /^[\w.:[\]-]+$/.test(host) && /^https?$/.test(proto) ? `${proto}://${host}` : '';
  const target = data ? `/#s=${id}` : '/';
  let hasImage = false;
  try {
    hasImage = !!data && (await stat(userData.shareImage(id))).isFile();
  } catch {
    /* ohne Bild */
  }
  const title = String(data?.meta?.title || 'Route').slice(0, 120);
  const desc = String(data?.meta?.description || 'Geplant mit Veloterra – Routen nach Belag und Straßenart').slice(
    0,
    200,
  );
  const image = hasImage ? `${base}/api/shares/${id}/image.jpg` : `${base}/icon-512.png`;
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>${esc(title)} – Veloterra</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Veloterra">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
${hasImage ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : ''}
${base ? `<meta property="og:url" content="${esc(`${base}/s/${id}`)}">` : ''}
<meta name="twitter:card" content="${hasImage ? 'summary_large_image' : 'summary'}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<style>body{background:#18191b;color:#e8eaed;font:15px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0}a{color:#8ab4f8}</style>
</head><body><a href="${esc(target)}">${data ? 'Route in Veloterra öffnen' : 'Diese geteilte Route gibt es nicht (mehr) – zu Veloterra'}</a>
<script>location.replace(${JSON.stringify(target)})</script></body></html>`;
  res.writeHead(data ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const short = url.pathname.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/);
  if (short && req.method === 'GET') return sharePage(req, res, short[1]);
  const path = url.pathname.replace(/^\/api/, '');
  const m = req.method ?? 'GET';
  const user = accounts.userFor(cookies(req)[COOKIE]);
  const admin = user?.role === 'admin';

  if (m === 'GET' && path === '/session')
    return send(res, 200, { user: pub(user), admin, loginEnabled: accounts.loginEnabled, accounts: true, config });

  if (await handleAccount(req, res, m, path, user)) return;

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

  // ab hier nur Admin
  if (!user) return send(res, 401, { error: 'Bitte anmelden' });
  if (!admin) return send(res, 403, { error: 'Nur für Admins' });

  if (await handleUsers(req, res, m, path, user)) return;

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
await accounts.load();
await loadIndex();

createServer((req, res) => {
  handle(req, res).catch((e: Error) => {
    if (!res.headersSent) send(res, 400, { error: e.message || 'Fehler' });
  });
}).listen(PORT, () => {
  const n = accounts.list().length;
  console.log(
    `veloterra-api: Port ${PORT}, Daten in ${DATA_DIR}, ${index.size} Kacheln, ${n} Konto/Konten, Admin ${PASSWORD ? `„${ADMIN_USER}“ aktiv` : 'aus der Umgebung nicht gesetzt (ADMIN_PASSWORD)'}`,
  );
});
