import type { LngLat } from '../domain/geo';
import { generateProfile, type ProfileOptions } from '../domain/profile';
import { parseBRouter, type LegResult, type Nogo, type Waypoint } from '../domain/route';
import type { RoutingSettings } from '../domain/settings';
import { useSite } from './site';

/**
 * BRouter-Server ohne Eintrag im Admin-Bereich: zur Laufzeit aus /config.js
 * (Container-Variable BROUTER_URL bzw. BROUTER_UPSTREAM), sonst beim Build
 * VITE_BROUTER_URL, sonst der öffentliche Server.
 */
export const DEFAULT_BROUTER_URL: string = (
  (typeof window !== 'undefined' && window.__VELOTERRA__?.brouterUrl) ||
  import.meta.env.VITE_BROUTER_URL ||
  'https://brouter.de/brouter'
).replace(/\/+$/, '');

/** Aktiver Server: Eintrag im Admin-Bereich (Veloterra-Server) geht vor. */
export const brouterUrl = () => (useSite.getState().config.brouterUrl || DEFAULT_BROUTER_URL).replace(/\/+$/, '');

/** Eigener Server ohne Drosselung? Dann dürfen Anfragen parallel laufen. */
export const ownServer = () => !/^https:\/\/brouter\.de\//.test(brouterUrl());

const profileIds = new Map<string, Promise<string>>();

async function uploadProfile(text: string): Promise<string> {
  const res = await fetch(`${brouterUrl()}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: text,
  });
  const json = await res.json();
  if (json.error) throw new Error(`Profil-Fehler: ${json.error}`);
  return json.profileid as string;
}

function profileId(text: string, force = false): Promise<string> {
  // Profil-IDs gelten nur auf dem Server, der sie vergeben hat
  const key = `${brouterUrl()}\n${text}`;
  let p = profileIds.get(key);
  if (!p || force) {
    p = uploadProfile(text);
    p.catch(() => profileIds.delete(key));
    profileIds.set(key, p);
  }
  return p;
}

export interface LegRequest {
  from: Waypoint;
  to: Waypoint;
  settings: RoutingSettings;
  nogos: Nogo[];
  alternative: number;
}

export function requestKey(r: LegRequest): string {
  return JSON.stringify([
    r.from.lng.toFixed(6),
    r.from.lat.toFixed(6),
    r.to.lng.toFixed(6),
    r.to.lat.toFixed(6),
    r.settings,
    r.nogos.map((n) => `${n.lng.toFixed(6)},${n.lat.toFixed(6)},${Math.round(n.radius)}`),
    r.alternative,
  ]);
}

const nogoParam = (nogos: Nogo[]) =>
  nogos.map((n) => `${n.lng.toFixed(6)},${n.lat.toFixed(6)},${Math.round(n.radius)}`).join('|');

function legParams(r: LegRequest): Record<string, string> {
  const params: Record<string, string> = {
    lonlats: `${r.from.lng.toFixed(6)},${r.from.lat.toFixed(6)}|${r.to.lng.toFixed(6)},${r.to.lat.toFixed(6)}`,
    alternativeidx: String(r.alternative),
  };
  if (r.nogos.length) params.nogos = nogoParam(r.nogos);
  return params;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/**
 * brouter.de begrenzt Anfragen pro IP – dort nacheinander anfragen. Ein
 * eigener Server verträgt mehrere gleichzeitig.
 */
const maxParallel = () => (ownServer() ? 4 : 1);
let running = 0;
const waiting: (() => void)[] = [];
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      running++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          running--;
          waiting.shift()?.();
        });
    };
    if (running < maxParallel()) start();
    else waiting.push(start);
  });
}

export function routeLeg(r: LegRequest, signal?: AbortSignal): Promise<LegResult> {
  return enqueue(() => requestNow(legParams(r), r.settings, signal));
}

export interface RoundTripRequest {
  start: { lng: number; lat: number };
  settings: RoutingSettings;
  nogos: Nogo[];
  /** Suchradius in Metern (BRouter: roundTripDistance) */
  radius: number;
  /** Richtung in Grad (0 = Nord, 90 = Ost) */
  direction: number;
}

/**
 * Wie weit BRouter Stichstraßen an den Rundtour-Hilfspunkten abschneiden darf
 * (m). Unbegrenzt (0) ließ in Messungen Anfragen scheitern; den Rest erledigt
 * removeSpurs.
 */
const ROUNDTRIP_CORRECT_DISTANCE = 400;

/** Rundtour über BRouters eingebauten Rundtour-Modus (engineMode=4). */
export function routeRoundTrip(r: RoundTripRequest, signal?: AbortSignal): Promise<LegResult> {
  const params: Record<string, string> = {
    lonlats: `${r.start.lng.toFixed(6)},${r.start.lat.toFixed(6)}`,
    engineMode: '4',
    roundTripDistance: String(Math.round(r.radius)),
    direction: String(Math.round(((r.direction % 360) + 360) % 360)),
  };
  if (r.nogos.length) params.nogos = nogoParam(r.nogos);
  return enqueue(() =>
    requestNow(params, r.settings, signal, { roundTrip: { correctDistance: ROUNDTRIP_CORRECT_DISTANCE } }),
  );
}

/** Route über viele Punkte in einer Anfrage (z. B. GPX-Import). */
export function routeVia(
  points: LngLat[],
  settings: RoutingSettings,
  nogos: Nogo[],
  signal?: AbortSignal,
): Promise<LegResult> {
  const params: Record<string, string> = {
    lonlats: points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join('|'),
  };
  if (nogos.length) params.nogos = nogoParam(nogos);
  return enqueue(() => requestNow(params, settings, signal));
}

async function requestNow(
  params: Record<string, string>,
  settings: RoutingSettings,
  signal?: AbortSignal,
  profile: ProfileOptions = {},
): Promise<LegResult> {
  signal?.throwIfAborted();
  const text = generateProfile(settings, profile);
  let reuploaded = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = await profileId(text, reuploaded);
    const query = new URLSearchParams({ ...params, profile: id, format: 'geojson', turnInstructionMode: '9' });
    const res = await fetch(`${brouterUrl()}?${query.toString()}`, { signal });
    const body = await res.text();
    if (res.ok && body.trimStart().startsWith('{')) return parseBRouter(JSON.parse(body));
    // Rate-Limit → kurz warten und erneut versuchen
    if (/retry later/i.test(body)) {
      await sleep(1500 * (attempt + 1), signal);
      continue;
    }
    // Custom-Profile laufen auf dem Server nach einiger Zeit ab → neu hochladen
    if (!reuploaded && (body.trim() === '' || /profile/i.test(body))) {
      reuploaded = true;
      continue;
    }
    throw new Error(translateError(body));
  }
  throw new Error('Der Routing-Server ist gerade ausgelastet. Bitte gleich nochmal versuchen.');
}

function translateError(msg: string): string {
  if (/position not mapped|not mapped in existing datafile/i.test(msg))
    return 'Ein Wegpunkt liegt außerhalb der Kartendaten.';
  if (/restricted area/i.test(msg)) return 'Ein Wegpunkt liegt in einem gesperrten Bereich.';
  if (/target island|not reachable|no track found|no path found/i.test(msg))
    return 'Keine Route gefunden – vermutlich schließen die Einstellungen (z. B. „Sperren“) alle Wege aus.';
  return msg.slice(0, 200) || 'Routing fehlgeschlagen';
}
