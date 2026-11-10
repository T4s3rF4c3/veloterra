import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Climb } from '../domain/climbs';
import { formatKm } from '../domain/geo';
import type { CombinedRoute } from '../domain/route';
import { ROADS, SURFACE_CLASS, SURFACES } from '../domain/settings';
import type { LegStatus } from '../hooks/useRouting';
import { RAIN_SCALE } from '../api/rain';
import type { RainPoint } from '../domain/weather';
import { useStore } from '../store';

const SURFACE = Object.fromEntries(SURFACES.map((s) => [s.key, s]));
const ROAD = Object.fromEntries(ROADS.map((r) => [r.key, r]));

/** Helle Schrift auf dunklen Feldern, dunkle auf hellen. */
function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? '#202124' : '#e8eaed';
}

const kmLabel = (m: number) => (m / 1000).toFixed(1).replace('.', ',');
const clock = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const mmLabel = (mm: number) => mm.toFixed(1).replace('.', ',');

/** Farbe im Regen-Balken: Menge wie auf der Karte, sonst „möglich“ oder trocken */
function rainFill(p: RainPoint) {
  if (p.mm >= 0.1) {
    let c = RAIN_SCALE[0];
    for (const s of RAIN_SCALE) if (p.mm >= s.min) c = s;
    return `rgb(${c.rgba.slice(0, 3).join(' ')})`;
  }
  return p.prob >= 40 ? 'url(#band-rain-maybe)' : '#303134';
}

function rainText(p: RainPoint) {
  if (p.mm >= 0.1) return `Regen ${mmLabel(p.mm)} mm/h (${Math.round(p.prob)} %)`;
  return p.prob >= 40 ? `Regen möglich (${Math.round(p.prob)} %)` : `trocken (${Math.round(p.prob)} %)`;
}

/** Schritt für die km-Teilung, so dass etwa 8–12 Striche passen. */
function tickStep(km: number) {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100]) if (km / s <= 12) return s;
  return 200;
}

/**
 * Streckenband: die Route gerade gezogen, mit gemeinsamem km-Lineal und je
 * einer Zeile für Belag, Straßenart und Steigung. Eigene Änderungen stehen als
 * rote Revision im Band. Ziehen markiert einen Abschnitt, wie auf der Karte.
 */
export function Streckenband({
  route,
  climbs,
  legs,
  stale,
  rain,
}: {
  route: CombinedRoute;
  climbs: Climb[];
  legs: LegStatus[];
  stale: boolean;
  /** Regen alle ~2,5 km zur Ankunftszeit (null = wird geladen) */
  rain: RainPoint[] | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [drag, setDrag] = useState<number | null>(null);
  const hover = useStore((s) => s.hoverDistance);
  const selection = useStore((s) => s.selection);
  const overrides = useStore((s) => s.overrides);

  // Breite sofort messen, danach Größenänderungen verfolgen
  useLayoutEffect(() => setW(ref.current!.clientWidth), []);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);

  // Auf dem Handy nur Belag, Regen und Steigung
  const compact = w < 560;
  const PAD = { l: compact ? 64 : 92, r: 12 };
  const ROW = {
    ruler: 22,
    surface: 30,
    road: 54,
    rain: compact ? 52 : 76,
    elevTop: compact ? 74 : 100,
    elevBottom: compact ? 114 : 158,
  };
  const RAIN_H = 12;
  const H = ROW.elevBottom + 24;
  const total = route.dist[route.dist.length - 1] || 1;
  const iw = Math.max(1, w - PAD.l - PAD.r);
  const xOf = (d: number) => PAD.l + (d / total) * iw;
  const xi = (i: number) => xOf(route.dist[i]);

  const elev = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const e of route.ele) {
      min = Math.min(min, e);
      max = Math.max(max, e);
    }
    const span = Math.max(max - min, 50);
    const h = ROW.elevBottom - ROW.elevTop;
    const step = Math.max(1, Math.floor(route.coords.length / iw));
    let d = '';
    for (let i = 0; i < route.coords.length; i += step) {
      const x = PAD.l + (route.dist[i] / total) * iw;
      const y = ROW.elevBottom - ((route.ele[i] - min) / span) * h;
      d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return { min, max, line: d, area: `${d}L${PAD.l + iw},${ROW.elevBottom}L${PAD.l},${ROW.elevBottom}Z` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, iw, total, compact]);

  // Eigene Änderungen je Etappe, in Reihenfolge der Route nummeriert
  const revisions = route.legRanges
    .filter((l) => overrides[l.key])
    .map((l, i) => {
      const o = overrides[l.key];
      const what = [
        o.avoid?.length && `${o.avoid.length}× umfahren`,
        o.alternative && `Alternative ${o.alternative}`,
        o.settings && 'eigene Einstellungen',
      ]
        .filter(Boolean)
        .join(', ');
      return { n: i + 1, from: route.dist[l.from], to: route.dist[l.to], what: what || 'angepasst' };
    });

  const dOf = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total, ((clientX - rect.left - PAD.l) / iw) * total));
  };
  const st = useStore.getState;
  const end = selection ? (selection.end ?? hover) : null;
  const sel = selection && end !== null ? [Math.min(selection.start, end), Math.max(selection.start, end)] : null;

  // Was liegt unter dem Cursor?
  const at =
    hover !== null ? route.segments.find((s) => route.dist[s.from] <= hover && route.dist[s.to] >= hover) : undefined;
  const rainAt =
    hover !== null && rain?.length
      ? rain.reduce((a, p) => (Math.abs(p.distance - hover) < Math.abs(a.distance - hover) ? p : a), rain[0])
      : null;
  const km = total / 1000;
  const step = tickStep(km);
  const ticks: number[] = [];
  for (let k = step; k < km - step * 0.4; k += step) ticks.push(k);

  return (
    <section className="band" aria-label="Streckenband">
      <header className="band-head">
        <span className="cap">Streckenband</span>
        <span className="band-meta">0 – {kmLabel(total)} km</span>
        {hover !== null ? (
          <span className="band-meta strong">
            km {kmLabel(hover)}
            {at && ` · ${SURFACE[at.surface].label} · ${ROAD[at.road].label}`}
            {rainAt && ` · um ${clock(rainAt.time)} ${rainText(rainAt)}`}
          </span>
        ) : (
          <span className="band-meta">Ziehen markiert einen Abschnitt</span>
        )}
        {revisions.length > 0 && (
          <span className="band-meta redline">
            {revisions.length === 1 ? '1 Revision' : `${revisions.length} Revisionen`}
          </span>
        )}
      </header>
      <div
        ref={ref}
        className="band-plot"
        onPointerMove={(e) => {
          const d = dOf(e.clientX);
          st().setHoverDistance(d);
          if (drag !== null) st().setSelection({ start: Math.min(drag, d), end: Math.max(drag, d) });
        }}
        onPointerLeave={() => drag === null && st().setHoverDistance(null)}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const d = dOf(e.clientX);
          setDrag(d);
          st().setSelection(null);
        }}
        onPointerUp={(e) => {
          const d = dOf(e.clientX);
          if (drag !== null && Math.abs(d - drag) < total * 0.005) st().setSelection(null);
          setDrag(null);
        }}
      >
        <svg width={w} height={H} role="img" aria-label={`Streckenband über ${kmLabel(total)} km`}>
          <defs>
            <pattern id="band-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#303134" />
              <rect width="2" height="6" fill="#80868b" />
            </pattern>
            <pattern id="band-rough" width="5" height="16" patternUnits="userSpaceOnUse">
              <rect x="3" width="2" height="16" fill="#202124" opacity="0.85" />
            </pattern>
            <pattern
              id="band-rain-maybe"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="5" height="5" fill="#303134" />
              <rect width="2" height="5" fill="#5f8fbf" />
            </pattern>
            <pattern id="band-track" width="5" height="16" patternUnits="userSpaceOnUse">
              <rect width="5" height="16" fill="#303134" />
              <rect width="2" height="16" fill="#c9a27e" />
            </pattern>
          </defs>

          {/* Zeilenköpfe */}
          <g className="band-label">
            <text x={0} y={ROW.surface + 12}>
              Belag
            </text>
            {!compact && (
              <text x={0} y={ROW.road + 12}>
                Straßenart
              </text>
            )}
            <text x={0} y={ROW.rain + 10}>
              Regen
            </text>
            <text x={0} y={ROW.elevTop + 12}>
              Steigung
            </text>
            <text x={0} y={ROW.elevTop + 28} className="band-axis">
              {Math.round(elev.min)}–{Math.round(elev.max)} m
            </text>
          </g>

          {/* km-Lineal; Etappen, die gerade rechnen, gestrichelt */}
          <g className="band-axis">
            <text x={PAD.l} y={12}>
              0
            </text>
            {ticks.map((k) => (
              <g key={k}>
                <line x1={xOf(k * 1000)} x2={xOf(k * 1000)} y1={15} y2={ROW.ruler} className="band-tick" />
                <text x={xOf(k * 1000)} y={12} textAnchor="middle">
                  {k}
                </text>
              </g>
            ))}
            <text x={PAD.l + iw} y={12} textAnchor="end">
              {kmLabel(total)}
            </text>
          </g>
          {route.legRanges.map((l, i) => (
            <line
              key={l.key}
              x1={xi(l.from)}
              x2={xi(l.to)}
              y1={ROW.ruler}
              y2={ROW.ruler}
              className={`band-leg ${stale || legs[i]?.loading ? 'pending' : ''}`}
            />
          ))}

          {/* Wegpunkte auf dem Lineal */}
          {route.legRanges.map((l, i) => {
            const last = i === route.legRanges.length - 1;
            const marks = i === 0 ? [{ at: l.from, t: 'A' }] : [];
            marks.push({ at: l.to, t: last ? 'B' : String(i + 1) });
            return marks.map((m) => (
              <g key={`${l.key}-${m.t}`} className={`band-wp ${m.t === 'B' ? 'end' : ''}`}>
                <circle cx={xi(m.at)} cy={ROW.ruler} r={6} />
                <text x={xi(m.at)} y={ROW.ruler + 3} textAnchor="middle">
                  {m.t}
                </text>
              </g>
            ));
          })}

          {/* Belag, nach Klasse zusammengefasst */}
          <g shapeRendering="crispEdges">
            {mergeClasses(route).map((s, i) => (
              <rect
                key={i}
                x={xi(s.from)}
                y={ROW.surface}
                width={Math.max(0.6, xi(s.to) - xi(s.from))}
                height={16}
                fill={s.surface === 'unknown' ? 'url(#band-hatch)' : SURFACE[s.surface].color}
              >
                <title>
                  Klasse {SURFACE_CLASS[s.surface] || '?'} · {SURFACE[s.surface].label} · km{' '}
                  {kmLabel(route.dist[s.from])}–{kmLabel(route.dist[s.to])}
                </title>
              </rect>
            ))}
            {/* grobe Beläge mit derselben Strich-Textur wie auf der Karte */}
            {mergeClasses(route)
              .filter((s) => SURFACE_CLASS[s.surface] >= 3)
              .map((s, i) => (
                <rect
                  key={`r${i}`}
                  x={xi(s.from)}
                  y={ROW.surface}
                  width={Math.max(0.6, xi(s.to) - xi(s.from))}
                  height={16}
                  fill="url(#band-rough)"
                  pointerEvents="none"
                />
              ))}
          </g>

          {/* Straßenart, beschriftet wo Platz ist */}
          {!compact &&
            mergeRoads(route).map((r, i) => {
              const x = xi(r.from);
              const width = Math.max(0.6, xi(r.to) - x);
              const c = ROAD[r.road];
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={ROW.road}
                    width={width}
                    height={16}
                    fill={r.road === 'track' ? 'url(#band-track)' : c.color}
                    shapeRendering="crispEdges"
                  />
                  {width > c.label.length * 6.2 + 10 && (
                    <text x={x + 5} y={ROW.road + 12} className="band-seg" fill={inkOn(c.color)}>
                      {c.label}
                    </text>
                  )}
                </g>
              );
            })}

          {/* Regen zur Ankunftszeit: Menge wie auf der Karte, gestreift = möglich */}
          <g shapeRendering="crispEdges">
            {!rain ? (
              <rect x={PAD.l} y={ROW.rain} width={iw} height={RAIN_H} fill="#303134" className="band-loading">
                <title>Regenvorhersage wird geladen …</title>
              </rect>
            ) : (
              rain.map((p, i) => {
                const a = i === 0 ? 0 : (rain[i - 1].distance + p.distance) / 2;
                const b = i === rain.length - 1 ? total : (p.distance + rain[i + 1].distance) / 2;
                return (
                  <rect
                    key={i}
                    x={xOf(a)}
                    y={ROW.rain}
                    width={Math.max(0.6, xOf(b) - xOf(a))}
                    height={RAIN_H}
                    fill={rainFill(p)}
                  >
                    <title>
                      km {kmLabel(a)}–{kmLabel(b)} · an {clock(p.time)} · {rainText(p)}
                    </title>
                  </rect>
                );
              })
            )}
          </g>

          {/* Steigung */}
          {climbs.map((c, i) => (
            <rect
              key={i}
              x={xOf(c.start)}
              y={ROW.elevTop}
              width={Math.max(1, xOf(c.end) - xOf(c.start))}
              height={ROW.elevBottom - ROW.elevTop}
              className="band-climb"
            >
              <title>
                Anstieg {formatKm(c.end - c.start)} · Ø {c.avg.toFixed(1).replace('.', ',')} %
              </title>
            </rect>
          ))}
          <path d={elev.area} className="band-elev-area" />
          <path d={elev.line} className="band-elev-line" />
          <line x1={PAD.l} x2={PAD.l + iw} y1={ROW.elevBottom} y2={ROW.elevBottom} className="band-tick" />

          {/* Revisionen: umfahrene oder angepasste Etappen bleiben sichtbar */}
          {revisions.map((r) => {
            const x1 = xOf(r.from);
            const x2 = xOf(r.to);
            const bottom = compact ? ROW.surface + 19 : ROW.road + 19;
            return (
              <g key={r.n} className="band-rev">
                <title>
                  Revision {r.n}: {r.what}
                </title>
                <rect x={x1} y={ROW.surface - 3} width={Math.max(2, x2 - x1)} height={bottom - ROW.surface + 3} />
                <path d={`M${x2 - 9} ${bottom + 17}l9 -15l9 15z`} />
                <text x={x2} y={bottom + 15} textAnchor="middle">
                  {r.n}
                </text>
              </g>
            );
          })}

          {sel && (
            <rect
              x={xOf(sel[0])}
              y={ROW.surface - 4}
              width={Math.max(1, xOf(sel[1]) - xOf(sel[0]))}
              height={ROW.elevBottom - ROW.surface + 4}
              className="band-sel"
            />
          )}
          {hover !== null && (
            <g className="band-cursor">
              <line x1={xOf(hover)} x2={xOf(hover)} y1={ROW.ruler} y2={ROW.elevBottom + 4} />
              <rect
                x={Math.min(Math.max(xOf(hover) - 24, PAD.l), PAD.l + iw - 48)}
                y={ROW.elevBottom + 5}
                width={48}
                height={18}
                rx={3}
              />
              <text
                x={Math.min(Math.max(xOf(hover), PAD.l + 24), PAD.l + iw - 24)}
                y={ROW.elevBottom + 18}
                textAnchor="middle"
              >
                {kmLabel(hover)}
              </text>
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}

/** Aufeinanderfolgende Segmente gleicher Belagsklasse zusammenfassen (gegen Nähte im Band). */
function mergeClasses(route: CombinedRoute) {
  const out: { from: number; to: number; surface: CombinedRoute['segments'][number]['surface'] }[] = [];
  for (const s of route.segments) {
    const last = out[out.length - 1];
    if (last && SURFACE_CLASS[last.surface] === SURFACE_CLASS[s.surface] && last.to === s.from) last.to = s.to;
    else out.push({ from: s.from, to: s.to, surface: s.surface });
  }
  return out;
}

/** Aufeinanderfolgende Segmente gleicher Straßenart zusammenfassen. */
function mergeRoads(route: CombinedRoute) {
  const out: { from: number; to: number; road: CombinedRoute['segments'][number]['road'] }[] = [];
  for (const s of route.segments) {
    const last = out[out.length - 1];
    if (last && last.road === s.road && last.to === s.from) last.to = s.to;
    else out.push({ from: s.from, to: s.to, road: s.road });
  }
  return out;
}
