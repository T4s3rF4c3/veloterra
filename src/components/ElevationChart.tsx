import { useEffect, useMemo, useRef, useState } from 'react';
import { formatKm } from '../domain/geo';
import type { Climb } from '../domain/climbs';
import type { CombinedRoute } from '../domain/route';
import type { Piece } from '../hooks/useColoring';
import { useStore } from '../store';

const H = 110;
const PAD = { l: 38, r: 10, t: 10, b: 20 };

/** Höhenprofil mit Farbstreifen und Anstiegen. Ziehen markiert einen Abschnitt. */
export function ElevationChart({ route, pieces, climbs }: { route: CombinedRoute; pieces: Piece[]; climbs: Climb[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [drag, setDrag] = useState<number | null>(null);
  const hover = useStore((s) => s.hoverDistance);
  const selection = useStore((s) => s.selection);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);

  const total = route.dist[route.dist.length - 1] || 1;
  const { min, max, path, area } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const e of route.ele) {
      min = Math.min(min, e);
      max = Math.max(max, e);
    }
    const span = Math.max(max - min, 50);
    max = min + span;
    const iw = w - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const step = Math.max(1, Math.floor(route.coords.length / iw));
    let d = '';
    for (let i = 0; i < route.coords.length; i += step) {
      const x = PAD.l + (route.dist[i] / total) * iw;
      const y = PAD.t + ih - ((route.ele[i] - min) / span) * ih;
      d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    const area = `${d}L${PAD.l + iw},${PAD.t + ih}L${PAD.l},${PAD.t + ih}Z`;
    return { min, max, path: d, area };
  }, [route, w, total]);

  const iw = w - PAD.l - PAD.r;
  const xOf = (d: number) => PAD.l + (d / total) * iw;
  const dOf = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total, ((clientX - rect.left - PAD.l) / iw) * total));
  };

  const st = useStore.getState;
  const sel =
    selection && (selection.end ?? hover) !== null
      ? [Math.min(selection.start, (selection.end ?? hover)!), Math.max(selection.start, (selection.end ?? hover)!)]
      : null;

  return (
    <div
      ref={ref}
      className="elev"
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
      <svg width={w} height={H}>
        {[0, 0.5, 1].map((f) => {
          const y = PAD.t + (H - PAD.t - PAD.b) * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y} y2={y} className="grid" />
              <text x={PAD.l - 6} y={y + 3} textAnchor="end" className="axis">
                {Math.round(min + (max - min) * f)}
              </text>
            </g>
          );
        })}
        {climbs.map((c, i) => (
          <g key={i} className="elev-climb">
            <rect
              x={xOf(c.start)}
              y={PAD.t}
              width={Math.max(1, xOf(c.end) - xOf(c.start))}
              height={H - PAD.t - PAD.b}
            />
            {xOf(c.end) - xOf(c.start) > 34 && (
              <text x={(xOf(c.start) + xOf(c.end)) / 2} y={PAD.t + 9} textAnchor="middle">
                {c.avg.toFixed(1).replace('.', ',')} %
              </text>
            )}
          </g>
        ))}
        <path d={area} className="elev-area" />
        <path d={path} className="elev-line" />
        {/* Belags-/Straßenstreifen */}
        {pieces.map((s, i) => (
          <rect
            key={i}
            x={xOf(route.dist[s.from])}
            y={H - PAD.b + 3}
            width={Math.max(0.5, xOf(route.dist[s.to]) - xOf(route.dist[s.from]))}
            height={5}
            fill={s.color}
          />
        ))}
        {sel && (
          <rect
            x={xOf(sel[0])}
            y={PAD.t}
            width={xOf(sel[1]) - xOf(sel[0])}
            height={H - PAD.t - PAD.b}
            className="elev-sel"
          />
        )}
        {hover !== null && (
          <g>
            <line x1={xOf(hover)} x2={xOf(hover)} y1={PAD.t} y2={H - PAD.b} className="elev-hover" />
            <text x={Math.min(xOf(hover) + 4, w - 60)} y={PAD.t + 10} className="axis strong">
              {formatKm(hover)}
            </text>
          </g>
        )}
      </svg>
      <div className="elev-hint">Im Profil ziehen, um einen Abschnitt zu markieren</div>
    </div>
  );
}
