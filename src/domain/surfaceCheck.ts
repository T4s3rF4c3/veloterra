import { HIGHWAY_LABEL } from './classify';
import type { CombinedRoute, Segment } from './route';
import { SURFACES, type SurfaceCat } from './settings';

/**
 * Wie sicher ist der Belag eines Abschnitts?
 * - missing: kein surface-Tag und nichts, woraus man ihn ableiten könnte
 * - unclear: surface-Tag vorhanden, aber unbekannter Wert
 * - guessed: abgeleitet (Wegeklasse, „Radweg = Asphalt“) – bei Wirtschafts-,
 *   Rad- und Feldwegen oft falsch. Bei normalen Straßen ist die Annahme
 *   „Asphalt“ zuverlässig und wird nicht gemeldet.
 */
export type Uncertainty = 'missing' | 'unclear' | 'guessed';

export interface UncertainSection {
  /** stabile ID aus Anfangs-/Endpunkt (für „Passt“) */
  id: string;
  /** Indizes in route.coords */
  from: number;
  to: number;
  /** Meter ab Start */
  start: number;
  end: number;
  kind: Uncertainty;
  /** geschätzter Belag (bei guessed) */
  guess: SurfaceCat;
  /** Wegart des längsten Teilstücks, z. B. „Wirtschaftsweg“ */
  wayLabel: string;
  /** zusätzliche Hinweise, z. B. „Wegeklasse 2“ */
  detail?: string;
  /** Abschnitt besteht aus Stücken unterschiedlicher Sicherheit */
  mixed: boolean;
}

const RISKY_ROADS = new Set(['track', 'path', 'cycleway']);
const SEVERITY: Record<Uncertainty, number> = { guessed: 1, unclear: 2, missing: 3 };
/** Lücken bis zu dieser Länge zwischen unsicheren Stücken werden überbrückt */
const GAP = 30;
const MIN_LENGTH = 40;

export function uncertaintyOf(s: Segment): Uncertainty | null {
  if (s.surface === 'unknown') return s.surfaceInferred ? 'missing' : 'unclear';
  if (!s.surfaceInferred) return null;
  if (RISKY_ROADS.has(s.road) || s.tags.highway === 'service') return 'guessed';
  return null;
}

const TRACKTYPE: Record<string, string> = {
  grade1: 'Wegeklasse 1 (befestigt)',
  grade2: 'Wegeklasse 2 (meist befestigt)',
  grade3: 'Wegeklasse 3 (gemischt)',
  grade4: 'Wegeklasse 4 (meist unbefestigt)',
  grade5: 'Wegeklasse 5 (unbefestigt)',
};

const pt = (c: [number, number]) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`;

/** Zusammenhängende Abschnitte der Route mit unsicherem Belag. */
export function uncertainSections(route: CombinedRoute): UncertainSection[] {
  const len = (s: Segment) => route.dist[s.to] - route.dist[s.from];
  const runs: { segs: Segment[]; from: number; to: number }[] = [];
  for (const s of route.segments) {
    if (!uncertaintyOf(s)) continue;
    const last = runs[runs.length - 1];
    if (last && route.dist[s.from] - route.dist[last.to] <= GAP) {
      last.segs.push(s);
      last.to = s.to;
    } else {
      runs.push({ segs: [s], from: s.from, to: s.to });
    }
  }
  const out: UncertainSection[] = [];
  for (const r of runs) {
    const start = route.dist[r.from];
    const end = route.dist[r.to];
    if (end - start < MIN_LENGTH) continue;
    let kind: Uncertainty = 'guessed';
    const kinds = new Set<Uncertainty>();
    for (const s of r.segs) {
      const k = uncertaintyOf(s)!;
      kinds.add(k);
      if (SEVERITY[k] > SEVERITY[kind]) kind = k;
    }
    // geschätzten Belag vom längsten geschätzten Stück nehmen
    const guessedSegs = r.segs.filter((s) => uncertaintyOf(s) === 'guessed');
    const longest = (guessedSegs.length ? guessedSegs : r.segs).reduce((a, b) => (len(b) > len(a) ? b : a));
    const hw = longest.tags.highway ?? '';
    const tt = longest.tags.tracktype;
    const details = [tt && TRACKTYPE[tt], longest.tags.smoothness && `Fahrbahn: ${longest.tags.smoothness}`].filter(
      Boolean,
    ) as string[];
    out.push({
      id: `${pt(route.coords[r.from])}|${pt(route.coords[r.to])}`,
      from: r.from,
      to: r.to,
      start,
      end,
      kind,
      guess: longest.surface,
      wayLabel: HIGHWAY_LABEL[hw] ?? (hw || 'Weg'),
      detail: details.join(' · ') || undefined,
      mixed: kinds.size > 1,
    });
  }
  return out;
}

export function uncertaintyText(s: UncertainSection): string {
  const label = SURFACES.find((x) => x.key === s.guess)?.label ?? s.guess;
  if (s.mixed) return `Belag teils unbekannt, sonst geschätzt: ${label}`;
  if (s.kind === 'missing') return 'Kein Belag in OpenStreetMap erfasst';
  if (s.kind === 'unclear') return 'Belagsangabe unklar';
  return `Belag nur geschätzt: ${label}`;
}
