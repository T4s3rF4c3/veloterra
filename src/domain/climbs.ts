/** Steigungsklassen für Karte, Höhenprofil und Legende. */
export const GRADE_CLASSES: { key: string; label: string; min: number; color: string }[] = [
  { key: 'down', label: 'Gefälle', min: -Infinity, color: '#38bdf8' },
  { key: 'flat', label: '< 2 %', min: -2, color: '#22c55e' },
  { key: 'g2', label: '2–4 %', min: 2, color: '#a3e635' },
  { key: 'g4', label: '4–6 %', min: 4, color: '#facc15' },
  { key: 'g6', label: '6–8 %', min: 6, color: '#f97316' },
  { key: 'g8', label: '8–11 %', min: 8, color: '#dc2626' },
  { key: 'g11', label: '> 11 %', min: 11, color: '#7f1d1d' },
];

export function gradeClass(g: number) {
  let c = GRADE_CLASSES[0];
  for (const x of GRADE_CLASSES) if (g >= x.min) c = x;
  return c;
}

/**
 * Geglättete Steigung (in %) je Punkt der Route. Höhendaten aus SRTM sind
 * verrauscht – daher über ±window/2 Meter gemittelt.
 */
export function gradients(dist: number[], ele: number[], window = 200): number[] {
  const n = dist.length;
  const out = new Array<number>(n).fill(0);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (lo < i && dist[i] - dist[lo] > window / 2) lo++;
    while (hi < n - 1 && dist[hi + 1] - dist[i] <= window / 2) hi++;
    const d = dist[hi] - dist[lo];
    out[i] = d > 20 ? ((ele[hi] - ele[lo]) / d) * 100 : 0;
  }
  return out;
}

export interface Climb {
  /** Meter ab Start */
  start: number;
  end: number;
  length: number;
  gain: number;
  /** Durchschnittssteigung in % */
  avg: number;
  /** steilste 200 m in % */
  max: number;
  startEle: number;
  endEle: number;
  /** grobe Einstufung */
  level: 'leicht' | 'mittel' | 'schwer' | 'sehr schwer';
}

/** Höhe in gleichen Abständen (lineare Interpolation). */
function resampleEle(dist: number[], ele: number[], step: number): { d: number[]; e: number[] } {
  const total = dist[dist.length - 1];
  const d: number[] = [];
  const e: number[] = [];
  let j = 0;
  for (let x = 0; x <= total; x += step) {
    while (j < dist.length - 2 && dist[j + 1] < x) j++;
    const seg = dist[j + 1] - dist[j];
    const t = seg > 0 ? Math.min(1, Math.max(0, (x - dist[j]) / seg)) : 0;
    d.push(x);
    e.push(ele[j] + t * (ele[j + 1] - ele[j]));
  }
  // gleitender Mittelwert gegen Rauschen
  const smooth = e.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(e.length - 1, i + 2); k++) {
      s += e[k];
      c++;
    }
    return s / c;
  });
  return { d, e: smooth };
}

/**
 * Findet Anstiege: zusammenhängendes Bergauf, kurze Flachstücke und Dellen
 * (bis 10 m bzw. 15 % des bisherigen Anstiegs) werden überbrückt.
 */
export function detectClimbs(dist: number[], ele: number[]): Climb[] {
  if (dist.length < 2 || dist[dist.length - 1] < 300) return [];
  const STEP = 25;
  const { d, e } = resampleEle(dist, ele, STEP);
  const climbs: Climb[] = [];
  let startI = 0;
  let maxI = 0;
  const close = () => {
    // flache Stücke am Anfang und Ende gehören nicht zum Anstieg
    let a = startI;
    let b = maxI;
    while (a < b && e[a + 1] - e[a] < STEP * 0.015) a++;
    while (b > a && e[b] - e[b - 1] < STEP * 0.015) b--;
    const gain = e[b] - e[a];
    const length = d[b] - d[a];
    if (length >= 400 && gain >= 25 && (gain / length) * 100 >= 3) {
      // steilste 200 m
      let max = 0;
      const w = Math.round(200 / STEP);
      for (let i = a; i + w <= b; i++) max = Math.max(max, ((e[i + w] - e[i]) / (w * STEP)) * 100);
      const avg = (gain / length) * 100;
      const score = gain * avg; // grob wie Kategorien bei Rundfahrten
      climbs.push({
        start: d[a],
        end: d[b],
        length,
        gain,
        avg,
        max: Math.max(max, avg),
        startEle: e[a],
        endEle: e[b],
        level: score > 3500 ? 'sehr schwer' : score > 1800 ? 'schwer' : score > 800 ? 'mittel' : 'leicht',
      });
    }
  };
  for (let i = 1; i < e.length; i++) {
    if (e[i] > e[maxI]) {
      maxI = i;
      continue;
    }
    const gain = e[maxI] - e[startI];
    const drop = e[maxI] - e[i];
    // Abfahrt beendet den Anstieg; ebenso langes Flachstück ohne Höhengewinn
    if (drop > Math.max(10, gain * 0.15) || d[i] - d[maxI] > 1000) {
      close();
      // neuen Anstieg am tiefsten Punkt seit dem Gipfel beginnen
      let low = maxI;
      for (let k = maxI; k <= i; k++) if (e[k] < e[low]) low = k;
      startI = low;
      maxI = low;
      for (let k = low; k <= i; k++) if (e[k] > e[maxI]) maxI = k;
    } else if (gain <= 0 && e[i] < e[startI]) {
      startI = i;
      maxI = i;
    }
  }
  close();
  return climbs;
}
