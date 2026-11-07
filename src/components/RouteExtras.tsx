import { useState } from 'react';
import type { Climb } from '../domain/climbs';
import { formatKm, type LngLat } from '../domain/geo';
import { STOP_CATEGORIES } from '../domain/poi';
import type { CombinedRoute } from '../domain/route';
import { sliceLine } from '../domain/geo';
import { useStore } from '../store';

const LEVEL_CLASS: Record<Climb['level'], string> = {
  leicht: 'good',
  mittel: 'ok',
  schwer: 'bad',
  'sehr schwer': 'bad',
};

/** Liste der Anstiege – Klick markiert den Anstieg auf Karte und Profil. */
export function ClimbList({
  climbs,
  route,
  fit,
}: {
  climbs: Climb[];
  route: CombinedRoute;
  fit: (c: LngLat[]) => void;
}) {
  const st = useStore.getState;
  const [all, setAll] = useState(false);
  if (!climbs.length) return null;
  // bei vielen Anstiegen erst die schwersten zeigen (in Streckenreihenfolge)
  const LIMIT = 6;
  const shown = all
    ? climbs
    : [...climbs]
        .sort((a, b) => b.gain * b.avg - a.gain * a.avg)
        .slice(0, LIMIT)
        .sort((a, b) => a.start - b.start);
  return (
    <section className="card">
      <h2>Anstiege {climbs.length > LIMIT && !all ? `(${LIMIT} schwerste von ${climbs.length})` : ''}</h2>
      <ul className="list climbs">
        {shown.map((c, i) => (
          <li
            key={i}
            onMouseEnter={() => st().setHoverDistance((c.start + c.end) / 2)}
            onMouseLeave={() => st().setHoverDistance(null)}
            onClick={() => {
              st().setSelection({ start: c.start, end: c.end });
              fit(sliceLine(route.coords, route.dist, c.start, c.end));
            }}
            title="Anstieg markieren"
          >
            <span>
              <b>
                {formatKm(c.length)} · {c.avg.toFixed(1).replace('.', ',')} %
              </b>
              <small>
                ab km {(c.start / 1000).toFixed(1).replace('.', ',')} · {Math.round(c.gain)} hm · max{' '}
                {Math.round(c.max)} % · {Math.round(c.startEle)}→{Math.round(c.endEle)} m
              </small>
            </span>
            <span className={`score ${LEVEL_CLASS[c.level]}`}>{c.level}</span>
          </li>
        ))}
      </ul>
      {climbs.length > LIMIT && (
        <button className="mini ghost more" onClick={() => setAll(!all)}>
          {all ? 'Nur die schwersten zeigen' : `Alle ${climbs.length} Anstiege zeigen`}
        </button>
      )}
    </section>
  );
}

/** Stopps entlang der Route (Café, Wasser, Rad-Service …). */
export function StopsList({
  loading,
  error,
  partial,
  fly,
}: {
  loading: boolean;
  error: string | null;
  partial: boolean;
  fly: (c: LngLat, z?: number) => void;
}) {
  const stops = useStore((s) => s.stops);
  const cats = useStore((s) => s.stopCategories);
  const active = useStore((s) => s.activePoi);
  const st = useStore.getState;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Stopps unterwegs</h2>
        {loading && <span className="spinner" title="Wird geladen" />}
        <button className="mini ghost" onClick={() => st().setShowStops(false)} title="Stopps ausblenden">
          ✕
        </button>
      </div>
      <div className="chips">
        {STOP_CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={cats.includes(c.key) ? 'on' : ''}
            onClick={() =>
              st().setStopCategories(cats.includes(c.key) ? cats.filter((x) => x !== c.key) : [...cats, c.key])
            }
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {partial && (
        <p className="muted small">
          {loading
            ? 'Erste Treffer – der OpenStreetMap-Server ist langsam, vollständige Liste folgt …'
            : 'OpenStreetMap-Server ausgelastet: nur benannte Orte (z. B. kein Trinkwasser ohne Namen).'}
        </p>
      )}
      {loading && !stops.length && <p className="muted small">Suche entlang der Route …</p>}
      {!loading && !error && stops.length === 0 && (
        <p className="muted small">Nichts gefunden im Umkreis von 300 m um die Route.</p>
      )}
      {stops.length > 0 && (
        <ul className="list stops">
          {stops.map((p) => (
            <li
              key={p.id}
              className={active === p.id ? 'on' : ''}
              onMouseEnter={() => st().setHoverDistance(p.along ?? null)}
              onMouseLeave={() => st().setHoverDistance(null)}
              onClick={() => {
                st().setActivePoi(p.id);
                fly(p.coord, 15);
              }}
            >
              <span className="km">km {((p.along ?? 0) / 1000).toFixed(0)}</span>
              <span>
                <b>
                  {p.icon} {p.name}
                </b>
                <small>{p.offset < 40 ? 'direkt an der Route' : `${Math.round(p.offset)} m abseits`}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
