import type { LngLat } from './geo';

/**
 * Einlesen eigener Aktivitäten für die persönliche Heatmap: GPX, TCX und FIT
 * (Garmin), so wie sie im Strava-Datenexport oder einzeln vorliegen.
 * Bewusst ohne DOM, damit es auch in Tests und Workern läuft.
 */

const num = (s: string | undefined) => (s === undefined ? NaN : Number(s));
const valid = (lng: number, lat: number) =>
  Number.isFinite(lng) &&
  Number.isFinite(lat) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180 &&
  (lng !== 0 || lat !== 0);

/** Trackpunkte aus GPX (trkpt, ersatzweise rtept). */
export function parseGpxPoints(text: string): LngLat[] {
  const out: LngLat[] = [];
  for (const tag of ['trkpt', 'rtept']) {
    const re = new RegExp(`<${tag}\\b([^>]*)>`, 'g');
    for (const m of text.matchAll(re)) {
      const attrs = m[1];
      const lat = num(attrs.match(/\blat\s*=\s*["']([^"']+)["']/)?.[1]);
      const lon = num(attrs.match(/\blon\s*=\s*["']([^"']+)["']/)?.[1]);
      if (valid(lon, lat)) out.push([lon, lat]);
    }
    if (out.length) break;
  }
  return out;
}

/** Trackpunkte aus TCX (Garmin Training Center). */
export function parseTcxPoints(text: string): LngLat[] {
  const out: LngLat[] = [];
  const re =
    /<LatitudeDegrees>\s*([^<]+?)\s*<\/LatitudeDegrees>\s*<LongitudeDegrees>\s*([^<]+?)\s*<\/LongitudeDegrees>/g;
  for (const m of text.matchAll(re)) {
    const lat = num(m[1]);
    const lon = num(m[2]);
    if (valid(lon, lat)) out.push([lon, lat]);
  }
  return out;
}

const SEMICIRCLE = 180 / 2 ** 31;
const FIT_RECORD = 20;
const INVALID_SINT32 = 0x7fffffff;

interface FitDef {
  global: number;
  little: boolean;
  fields: { num: number; size: number }[];
  devSize: number;
}

/**
 * Minimaler FIT-Leser: nur die Positionen aus den „record“-Nachrichten.
 * FIT besteht aus Definitionen (Aufbau einer Nachricht) und Datensätzen.
 */
export function parseFitPoints(buf: Uint8Array): LngLat[] {
  if (buf.length < 14) return [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const headerSize = buf[0];
  const sig = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
  if (sig !== '.FIT') return [];
  const end = Math.min(buf.length, headerSize + dv.getUint32(4, true));
  const defs: (FitDef | undefined)[] = [];
  const out: LngLat[] = [];
  let pos = headerSize;

  const readData = (def: FitDef) => {
    let lat = NaN;
    let lon = NaN;
    for (const f of def.fields) {
      if (pos + f.size > end) return false;
      if (def.global === FIT_RECORD && f.size === 4 && (f.num === 0 || f.num === 1)) {
        const v = dv.getInt32(pos, def.little);
        if (v !== INVALID_SINT32) {
          if (f.num === 0) lat = v * SEMICIRCLE;
          else lon = v * SEMICIRCLE;
        }
      }
      pos += f.size;
    }
    pos += def.devSize;
    if (def.global === FIT_RECORD && valid(lon, lat)) out.push([lon, lat]);
    return true;
  };

  while (pos < end) {
    const h = buf[pos++];
    if (h & 0x80) {
      // Datensatz mit komprimiertem Zeitstempel
      const def = defs[(h >> 5) & 0x03];
      if (!def || !readData(def)) break;
    } else if (h & 0x40) {
      // Definition
      const local = h & 0x0f;
      const hasDev = (h & 0x20) !== 0;
      if (pos + 5 > end) break;
      pos++; // reserviert
      const little = buf[pos++] === 0;
      const global = dv.getUint16(pos, little);
      pos += 2;
      const n = buf[pos++];
      const fields: FitDef['fields'] = [];
      for (let i = 0; i < n; i++) {
        fields.push({ num: buf[pos], size: buf[pos + 1] });
        pos += 3;
      }
      let devSize = 0;
      if (hasDev) {
        const nd = buf[pos++];
        for (let i = 0; i < nd; i++) {
          devSize += buf[pos + 1];
          pos += 3;
        }
      }
      defs[local] = { global, little, fields, devSize };
    } else {
      const def = defs[h & 0x0f];
      if (!def || !readData(def)) break;
    }
  }
  return out;
}

/** Einfaches CSV (Strava activities.csv) – berücksichtigt Anführungszeichen. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Strava-Export: Dateiname → Aktivitätstyp (aus activities.csv). Spalten-
 * namen hängen von der Sprache des Kontos ab.
 */
export function stravaActivityTypes(csv: string): Map<string, string> {
  const rows = parseCsv(csv);
  const head = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const iType = head.findIndex((h) => /^(activity type|aktivitätsart|aktivitätstyp|type)$/.test(h));
  const iFile = head.findIndex((h) => /^(filename|dateiname)$/.test(h));
  const out = new Map<string, string>();
  if (iType < 0 || iFile < 0) return out;
  for (const r of rows.slice(1)) {
    const file = r[iFile]?.trim();
    if (file) out.set(file.replace(/^.*\//, ''), r[iType]?.trim() ?? '');
  }
  return out;
}

/** Radfahrt (draußen)? Virtuelle Fahrten und andere Sportarten nicht. */
export function isOutdoorRide(type: string): boolean {
  const t = type.toLowerCase();
  if (/virtual|virtuell|indoor|rolle|trainer/.test(t)) return false;
  return /ride|rad|bike|cycl|velo|gravel|mtb|mountain/.test(t);
}

/** Datei nach Endung lesen (auch .gz). */
export type ActivityFormat = 'gpx' | 'tcx' | 'fit';
export function activityFormat(name: string): { format: ActivityFormat; gzip: boolean } | null {
  const m = name.toLowerCase().match(/\.(gpx|tcx|fit)(\.gz)?$/);
  return m ? { format: m[1] as ActivityFormat, gzip: !!m[2] } : null;
}

export function parseActivity(format: ActivityFormat, data: Uint8Array): LngLat[] {
  if (format === 'fit') return parseFitPoints(data);
  const text = new TextDecoder().decode(data);
  return format === 'gpx' ? parseGpxPoints(text) : parseTcxPoints(text);
}
