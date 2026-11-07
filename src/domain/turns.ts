import { bearing, pointAtDistance, type LngLat } from './geo';
import type { CombinedRoute, TurnHint } from './route';

export interface TurnPoint {
  coord: LngLat;
  /** Meter ab Start */
  distance: number;
  /** z. B. „Rechts abbiegen“ */
  text: string;
  /** Kurzform (max. 10 Zeichen, für TCX) */
  short: string;
  /** GPX-Symbol / TCX-PointType */
  kind: 'left' | 'right' | 'straight' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right' | 'uturn';
}

/** BRouter VoiceHint-Kommandos → Richtung */
const CMD: Record<number, TurnPoint['kind']> = {
  1: 'straight',
  2: 'left',
  3: 'slight-left',
  4: 'sharp-left',
  5: 'right',
  6: 'slight-right',
  7: 'sharp-right',
  8: 'slight-left', // links halten
  9: 'slight-right', // rechts halten
  10: 'uturn',
  11: 'uturn',
  12: 'uturn',
  17: 'slight-left', // Ausfahrt links
  18: 'slight-right', // Ausfahrt rechts
};

const TEXT: Record<TurnPoint['kind'], string> = {
  straight: 'Geradeaus',
  left: 'Links abbiegen',
  right: 'Rechts abbiegen',
  'slight-left': 'Leicht links',
  'slight-right': 'Leicht rechts',
  'sharp-left': 'Scharf links',
  'sharp-right': 'Scharf rechts',
  uturn: 'Wenden',
};

const SHORT: Record<TurnPoint['kind'], string> = {
  straight: 'Gerade',
  left: 'Links',
  right: 'Rechts',
  'slight-left': 'Halb li',
  'slight-right': 'Halb re',
  'sharp-left': 'Scharf li',
  'sharp-right': 'Scharf re',
  uturn: 'Wenden',
};

function kindFromAngle(angle: number): TurnPoint['kind'] {
  const a = Math.abs(angle);
  const side = angle < 0 ? 'left' : 'right';
  if (a > 160) return 'uturn';
  if (a > 120) return `sharp-${side}`;
  if (a > 55) return side;
  return `slight-${side}`;
}

function hintText(h: TurnHint): { text: string; short: string; kind: TurnPoint['kind'] } {
  // Kreisverkehr (14 rechts herum, 15 links herum)
  if (h.cmd === 14 || h.cmd === 15) {
    return {
      text: h.exit > 0 ? `Im Kreisverkehr ${h.exit}. Ausfahrt` : 'Kreisverkehr',
      short: h.exit > 0 ? `Kreisel ${h.exit}` : 'Kreisel',
      kind: h.angle < -20 ? 'left' : h.angle > 20 ? 'right' : 'straight',
    };
  }
  const kind = CMD[h.cmd] ?? kindFromAngle(h.angle);
  const keep = h.cmd === 8 ? 'Links halten' : h.cmd === 9 ? 'Rechts halten' : null;
  return { text: keep ?? TEXT[kind], short: SHORT[kind], kind };
}

/** Abbiegewinkel am Punkt i aus der Geometrie (±30 m davor/danach). */
function angleAt(route: CombinedRoute, i: number): number {
  const d = route.dist[i];
  const a = pointAtDistance(route.coords, route.dist, d - 30);
  const b = pointAtDistance(route.coords, route.dist, d + 30);
  const inB = bearing(a, route.coords[i]);
  const outB = bearing(route.coords[i], b);
  return ((outB - inB + 540) % 360) - 180;
}

/**
 * Abbiegehinweise der ganzen Route. BRouter liefert sie je Etappe; an den
 * Wegpunkten selbst fehlen sie, dort wird aus der Geometrie ergänzt.
 */
export function turnPoints(route: CombinedRoute): TurnPoint[] {
  const out: TurnPoint[] = [];
  for (const h of route.hints) {
    if (h.cmd === 1 || h.cmd >= 100 || h.cmd === 13 || h.cmd === 16) continue;
    if (h.index <= 0 || h.index >= route.coords.length) continue;
    out.push({ coord: route.coords[h.index], distance: route.dist[h.index], ...hintText(h) });
  }
  for (const l of route.legRanges.slice(0, -1)) {
    const i = l.to;
    if (out.some((t) => Math.abs(t.distance - route.dist[i]) < 25)) continue;
    const angle = angleAt(route, i);
    if (Math.abs(angle) < 35) continue;
    const kind = kindFromAngle(angle);
    out.push({ coord: route.coords[i], distance: route.dist[i], text: TEXT[kind], short: SHORT[kind], kind });
  }
  return out.sort((a, b) => a.distance - b.distance);
}
