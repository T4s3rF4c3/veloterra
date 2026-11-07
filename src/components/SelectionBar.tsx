import { cumulativeDistances, formatKm, sliceLine } from '../domain/geo';
import { legKey, nogosAlongLine, type CombinedRoute } from '../domain/route';
import { ROADS, SURFACES, cloneSettings } from '../domain/settings';
import { avoidRange, legIndexAt } from '../actions';
import { useStore } from '../store';

const SNAP_M = 60;

/** Aktionen für einen markierten Abschnitt. */
export function SelectionBar({ route }: { route: CombinedRoute }) {
  const selection = useStore((s) => s.selection)!;
  const st = useStore.getState;
  const { start, end } = selection as { start: number; end: number };
  const line = sliceLine(route.coords, route.dist, start, end);

  // Zusammensetzung des Abschnitts
  const surf = new Map<string, number>();
  const road = new Map<string, number>();
  for (const s of route.segments) {
    const a = Math.max(route.dist[s.from], start);
    const b = Math.min(route.dist[s.to], end);
    if (b > a) {
      surf.set(s.surface, (surf.get(s.surface) ?? 0) + b - a);
      road.set(s.road, (road.get(s.road) ?? 0) + b - a);
    }
  }
  const top = <T extends { key: string; label: string; color: string }>(m: Map<string, number>, cats: T[]) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => ({ ...cats.find((c) => c.key === k)!, len: v }));
  const topSurf = top(surf, SURFACES);
  const topRoad = top(road, ROADS);

  const avoid = () => avoidRange(route, start, end);

  const block = () => {
    const nogos = nogosAlongLine(line, cumulativeDistances(line));
    const what = topRoad[0]?.label ?? 'Abschnitt';
    st().addBlock({ label: `${what}, ${formatKm(end - start)}`, line, nogos });
    st().setSelection(null);
  };

  const alternative = () => {
    const key = route.legRanges[legIndexAt(route, (start + end) / 2)].key;
    const o = st().overrides[key] ?? {};
    st().setOverride(key, { ...o, alternative: ((o.alternative ?? 0) + 1) % 4 });
  };

  /** Wegpunkte an Anfang und Ende setzen und den Teil dazwischen separat planen. */
  const replan = () => {
    const { waypoints, insertWaypoint, overrides, settings, setOverride, setEditingLeg } = st();
    const ia = legIndexAt(route, start);
    const ib = legIndexAt(route, end);
    const near = (d: number, idx: number) => Math.abs(route.dist[idx] - d) < SNAP_M;

    let endId: string;
    const legB = route.legRanges[ib];
    if (near(end, legB.to)) endId = waypoints[ib + 1].id;
    else if (near(end, legB.from)) endId = waypoints[ib].id;
    else endId = insertWaypoint(ib + 1, line[line.length - 1]);

    let startId: string;
    const legA = route.legRanges[ia];
    if (near(start, legA.from)) startId = waypoints[ia].id;
    else if (near(start, legA.to)) startId = waypoints[ia + 1].id;
    else startId = insertWaypoint(ia + 1, line[0]);

    const wps = st().waypoints;
    const si = wps.findIndex((w) => w.id === startId);
    const ei = wps.findIndex((w) => w.id === endId);
    // ein gemeinsames Objekt, damit der Editor die Etappen als Einheit erkennt
    const shared = cloneSettings(overrides[legKey(wps[si], wps[si + 1])]?.settings ?? settings);
    let firstKey: string | null = null;
    for (let i = si; i < ei; i++) {
      const key = legKey(wps[i], wps[i + 1]);
      firstKey ??= key;
      setOverride(key, { settings: shared });
    }
    st().setSelection(null);
    if (firstKey) setEditingLeg(firstKey);
  };

  return (
    <div className="selbar">
      <div className="selbar-info">
        <strong>Abschnitt · {formatKm(end - start)}</strong>
        <div className="selbar-mix">
          {topSurf.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.label} {Math.round((s.len / (end - start)) * 100)}%
            </span>
          ))}
          <span className="sep" />
          {topRoad.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="selbar-actions">
        <button className="primary" onClick={avoid} title="Diesen Abschnitt in der aktuellen Etappe umfahren">
          ⤳ Umgehen
        </button>
        <button onClick={replan} title="Nur diesen Abschnitt mit eigenen Einstellungen planen">
          ⚙ Anders planen
        </button>
        <button onClick={alternative} title="Alternative Route für diese Etappe">
          ⇄ Alternative
        </button>
        <button onClick={block} title="Für alle künftigen Routen sperren">
          ⛔ Immer meiden
        </button>
        <button className="ghost" onClick={() => st().setSelection(null)} aria-label="Abbrechen">
          ✕
        </button>
      </div>
    </div>
  );
}
