import { addProtocol } from 'maplibre-gl';

/**
 * Regen auf der Karte zu einer bestimmten Uhrzeit – vom Deutschen
 * Wetterdienst (frei, ohne Schlüssel):
 *
 * - Radar (Niederschlagsradar): gemessen der letzten Tage und Vorhersage
 *   für die nächsten ~2 Stunden, alle 5 Minuten, 1 km Raster
 * - danach Modellvorhersage ICON-EU: Niederschlag je Stunde, ~3 Tage
 *
 * Beide liefern eigene Farbskalen und eine graue Maske außerhalb des
 * Radarverbunds. Die Kacheln werden daher im Browser auf eine gemeinsame,
 * ruhige Skala umgefärbt (Blau = wenig, Gelb/Orange/Rot = viel).
 */

export type RainKind = 'radar' | 'icon';

const LAYER: Record<RainKind, string> = {
  radar: 'Niederschlagsradar',
  icon: 'Icon-eu_reg00625_fd_sl_TOTPREC01H',
};
const WMS = 'https://maps.dwd.de/geoserver/dwd/wms';

/** Farben der DWD-Legenden → Niederschlag in mm/h (Untergrenze der Klasse) */
const SOURCE: Record<RainKind, [string, number][]> = {
  radar: [
    ['#33FFFF', 0.1],
    ['#1ACC9A', 0.2],
    ['#019934', 0.4],
    ['#4DB31B', 1],
    ['#99CC01', 2],
    ['#CCE601', 3],
    ['#FFFF01', 5],
    ['#FFC401', 7.5],
    ['#FF8901', 10],
    ['#FF4501', 15],
    ['#FE0000', 30],
    ['#E5004C', 45],
    ['#CC0098', 75],
    ['#6600CB', 100],
    ['#0000FE', 150],
  ],
  icon: [
    // ICON fasst 0,1–2 mm in einer Klasse zusammen → als „leicht bis mäßig“
    ['#C0C0C0', 0.5],
    ['#FEFEC0', 2],
    ['#FEFE5B', 5],
    ['#CFF200', 10],
    ['#A0D625', 15],
    ['#36C969', 20],
    ['#00D7D7', 25],
    ['#00A6DD', 30],
    ['#0000FE', 40],
    ['#9730C2', 60],
    ['#D926C7', 80],
    ['#FE0000', 100],
    ['#A00000', 130],
    ['#606060', 160],
  ],
};

/** Gemeinsame Skala: ab mm/h → Farbe (RGBA, Deckkraft 0–255) */
export const RAIN_SCALE: { min: number; label: string; rgba: [number, number, number, number] }[] = [
  { min: 0.1, label: 'leicht', rgba: [150, 205, 255, 150] },
  { min: 0.5, label: 'mäßig', rgba: [80, 160, 255, 185] },
  { min: 2, label: 'kräftig', rgba: [40, 95, 235, 205] },
  { min: 5, label: 'stark', rgba: [250, 205, 55, 220] },
  { min: 10, label: 'sehr stark', rgba: [255, 130, 30, 230] },
  { min: 30, label: 'extrem', rgba: [230, 25, 95, 235] },
];

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const scaleFor = (mm: number) => {
  let c = RAIN_SCALE[0];
  for (const s of RAIN_SCALE) if (mm >= s.min) c = s;
  return c.rgba;
};

/** Farbe der Quelle → Farbe der gemeinsamen Skala (Treffer werden gemerkt) */
function recolorer(kind: RainKind) {
  const known = SOURCE[kind].map(([h, mm]) => ({ rgb: hex(h), mm }));
  const memo = new Map<number, [number, number, number, number] | null>();
  return (r: number, g: number, b: number) => {
    const key = (r << 16) | (g << 8) | b;
    let out = memo.get(key);
    if (out === undefined) {
      let best: (typeof known)[number] | null = null;
      let dist = 40 * 40;
      for (const k of known) {
        const d = (k.rgb[0] - r) ** 2 + (k.rgb[1] - g) ** 2 + (k.rgb[2] - b) ** 2;
        if (d < dist) {
          dist = d;
          best = k;
        }
      }
      out = best ? scaleFor(best.mm) : null;
      memo.set(key, out);
    }
    return out;
  };
}

const RECOLOR: Record<RainKind, ReturnType<typeof recolorer>> = { radar: recolorer('radar'), icon: recolorer('icon') };

/** Zuletzt geladene Kacheln (Hin- und Herfahren über das Streckenband ohne Nachladen) */
const blobs = new Map<string, Promise<Blob>>();
const MAX_BLOBS = 400;

/**
 * Kachel laden – bewusst ohne Abbruch: dieselbe Kachel wird oft gleich
 * wieder gebraucht (Maus fährt zurück), und mehrere Anfragen teilen sich den
 * Download. Ein Abbruch würde sonst auch die anderen scheitern lassen.
 */
function fetchBlob(url: string): Promise<Blob> {
  let p = blobs.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Regen-Kachel: Fehler ${r.status}`);
      return r.blob();
    });
    p.catch(() => blobs.delete(url));
    blobs.set(url, p);
    if (blobs.size > MAX_BLOBS) blobs.delete(blobs.keys().next().value!);
  }
  return p;
}

/** Große Kacheln: Der DWD-Server braucht je Anfrage Sekunden, egal wie groß das Bild ist. */
export const RAIN_TILE_SIZE = 1024;
export const RAIN_MAX_ZOOM = 8;

export interface TileId {
  z: number;
  x: number;
  y: number;
}

const HALF = Math.PI * 6378137;

/** Ausschnitt einer Kachel in Web-Mercator (EPSG:3857) */
function tileBbox({ z, x, y }: TileId): string {
  const size = (2 * HALF) / 2 ** z;
  return [x * size - HALF, HALF - (y + 1) * size, (x + 1) * size - HALF, HALF - y * size].join(',');
}

const isoOf = (t: number) => new Date(t).toISOString().replace('.000Z', 'Z');

function wmsUrl(kind: RainKind, time: string, tile: TileId) {
  return (
    `${WMS}?service=WMS&version=1.3.0&request=GetMap&format=image/png&transparent=true&styles=` +
    `&layers=dwd:${LAYER[kind]}&crs=EPSG:3857&width=${RAIN_TILE_SIZE}&height=${RAIN_TILE_SIZE}` +
    `&bbox=${tileBbox(tile)}&time=${time}`
  );
}

/** Kacheln, die MapLibre für diesen Ausschnitt anfordert (Rasterquelle mit 1024er-Kacheln) */
export function visibleRainTiles(bounds: [number, number, number, number], zoom: number): TileId[] {
  const z = Math.max(0, Math.min(RAIN_MAX_ZOOM, Math.round(zoom - Math.log2(RAIN_TILE_SIZE / 512))));
  const n = 2 ** z;
  const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const ty = (lat: number) => {
    const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const out: TileId[] = [];
  for (let x = Math.max(0, tx(bounds[0])); x <= Math.min(n - 1, tx(bounds[2])); x++)
    for (let y = Math.max(0, ty(bounds[3])); y <= Math.min(n - 1, ty(bounds[1])); y++) out.push({ z, x, y });
  return out.length <= 16 ? out : [];
}

let prefetchRun = 0;

/**
 * Bilder der Zeiten entlang der Route vorab laden (je 2 gleichzeitig), damit
 * das Fahren über das Streckenband ohne Wartezeit klappt. Ein neuer Aufruf
 * ersetzt die noch offene Warteschlange.
 */
export function prefetchRain(frames: RainFrame[], tiles: TileId[]) {
  const run = ++prefetchRun;
  const queue = frames.flatMap((f) => tiles.map((t) => wmsUrl(f.kind, isoOf(f.time), t))).filter((u) => !blobs.has(u));
  const worker = async () => {
    while (queue.length && run === prefetchRun) {
      await fetchBlob(queue.shift()!).catch(() => undefined);
    }
  };
  void worker();
  void worker();
}

let registered = false;

/**
 * Eigenes Kachel-Schema „rain://radar/2026-11-10T08:05:00Z?bbox=…“: holt das
 * WMS-Bild beim DWD und färbt es um.
 */
export function registerRainProtocol() {
  if (registered) return;
  registered = true;
  addProtocol('rain', async (params, abort) => {
    const m = params.url.match(/^rain:\/\/(radar|icon)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/);
    if (!m) throw new Error('Ungültige Regen-Kachel');
    const kind = m[1] as RainKind;
    const blob = await fetchBlob(wmsUrl(kind, m[2], { z: +m[3], x: +m[4], y: +m[5] }));
    if (abort.signal.aborted) throw new DOMException('abgebrochen', 'AbortError');
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const recolor = RECOLOR[kind];
    for (let i = 0; i < d.length; i += 4) {
      // halbtransparent = „keine Daten“-Maske bzw. Rand des Radarverbunds
      const c = d[i + 3] > 250 ? recolor(d[i], d[i + 1], d[i + 2]) : null;
      if (c) {
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = c[3];
      } else d[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
    return { data: await createImageBitmap(canvas) };
  });
}

/* ---------- Welche Zeiten gibt es? ---------- */

export interface RainCoverage {
  radar: { start: number; end: number } | null;
  icon: { start: number; end: number } | null;
}

let coverage: { at: number; value: Promise<RainCoverage> } | null = null;

async function timeRange(kind: RainKind): Promise<{ start: number; end: number } | null> {
  try {
    const res = await fetch(
      `https://maps.dwd.de/geoserver/dwd/${LAYER[kind]}/wms?service=WMS&version=1.3.0&request=GetCapabilities`,
    );
    const m = (await res.text()).match(/<Dimension name="time"[^>]*>\s*([^/<]+)\/([^/<]+)\//);
    return m ? { start: Date.parse(m[1]), end: Date.parse(m[2]) } : null;
  } catch {
    return null;
  }
}

/** Zeitraum mit Radar bzw. Vorhersage (alle 10 Minuten neu abgefragt) */
export function rainCoverage(): Promise<RainCoverage> {
  if (!coverage || Date.now() - coverage.at > 10 * 60_000) {
    const value = Promise.all([timeRange('radar'), timeRange('icon')]).then(([radar, icon]) => ({ radar, icon }));
    coverage = { at: Date.now(), value };
  }
  return coverage.value;
}

/* ---------- Bild zu einer Uhrzeit ---------- */

export interface RainFrame {
  kind: RainKind;
  /** Zeitpunkt des Bilds (ms) – bei ICON das Ende der Stunde */
  time: number;
  /** gemessen (true) oder vorhergesagt */
  observed: boolean;
}

const FIVE_MIN = 5 * 60_000;
const HOUR = 3600_000;

/**
 * Passendes Bild zur Uhrzeit t: bis ~2 Stunden voraus das Radar (5-Minuten-
 * Schritte), danach die stündliche ICON-Vorhersage für die Stunde, in die t
 * fällt. null, wenn es für t nichts gibt.
 */
export function rainFrameAt(t: number, cov: RainCoverage, now = Date.now()): RainFrame | null {
  if (cov.radar && t <= cov.radar.end) {
    // jüngstes gemessenes Bild ist meist 5–10 Minuten alt
    const time = Math.max(cov.radar.start, Math.floor(Math.min(t, cov.radar.end) / FIVE_MIN) * FIVE_MIN);
    return { kind: 'radar', time, observed: time <= now - FIVE_MIN };
  }
  if (cov.icon && t <= cov.icon.end) {
    const time = Math.max(cov.icon.start, Math.ceil((t + 1) / HOUR) * HOUR);
    if (time <= cov.icon.end) return { kind: 'icon', time, observed: false };
  }
  return null;
}

export const rainTiles = (f: RainFrame) => [`rain://${f.kind}/${isoOf(f.time)}/{z}/{x}/{y}`];

/** Unterschiedliche Bilder entlang der Route (höchstens 16, gleichmäßig verteilt) */
export function framesAlong(start: number, duration: number, cov: RainCoverage, now = Date.now()): RainFrame[] {
  const seen = new Map<string, RainFrame>();
  for (let i = 0; i <= 60; i++) {
    const f = rainFrameAt(start + (duration * 1000 * i) / 60, cov, now);
    if (f) seen.set(`${f.kind}/${f.time}`, f);
  }
  const all = [...seen.values()];
  if (all.length <= 16) return all;
  return Array.from({ length: 16 }, (_, i) => all[Math.round((i * (all.length - 1)) / 15)]);
}
