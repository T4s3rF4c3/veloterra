import { bearing, destination, formatKm, haversine } from '../domain/geo';
import { poiDetails } from '../domain/poi';
import type { CombinedRoute } from '../domain/route';
import { uid, useStore } from '../store';
import { Icon } from './Icon';
import { PoiPhotos } from './PoiPhotos';

/** Details und Aktionen zum gewählten Stopp bzw. Ziel. */
export function PoiCard({ route, fit }: { route: CombinedRoute | null; fit: (c: [number, number][]) => void }) {
  const activeId = useStore((s) => s.activePoi);
  const mode = useStore((s) => s.mode);
  const stops = useStore((s) => s.stops);
  const destinations = useStore((s) => s.destinations);
  const start = useStore((s) => s.loopStart);
  const st = useStore.getState;
  const list = mode === 'route' ? stops : mode === 'explore' ? destinations : [];
  const p = list.find((x) => x.id === activeId);
  if (!p) return null;

  const [lng, lat] = p.coord;
  const details = poiDetails(p);

  /** Stopp als Wegpunkt in die passende Etappe einfügen */
  const insert = () => {
    if (!route || p.along === undefined) return;
    const leg = route.legRanges.findIndex((l) => route.dist[l.from] <= p.along! && route.dist[l.to] >= p.along!);
    st().insertWaypoint(Math.max(leg, 0) + 1, p.coord);
    st().setActivePoi(null);
  };

  const routeTo = (loop: boolean) => {
    if (!start) return;
    const s = { id: uid(), lng: start[0], lat: start[1] };
    const target = { id: uid(), lng, lat };
    if (!loop) {
      st().replaceRoute([s, target], {}, `Nach ${p.name}`);
      fit([start, p.coord]);
      return;
    }
    // Rückweg über einen seitlich versetzten Punkt, damit nicht dieselbe Strecke zurück
    const d = haversine(start, p.coord);
    const q = destination(start, bearing(start, p.coord) + 50, d * 0.6);
    st().replaceRoute(
      [s, target, { id: uid(), lng: q[0], lat: q[1] }, { id: uid(), lng: start[0], lat: start[1] }],
      {},
      `Runde über ${p.name}`,
    );
    fit([start, p.coord, q]);
  };

  return (
    <div className="poi-card">
      <PoiPhotos poi={p} />
      <div className="poi-card-head">
        <span className="poi-icon">
          <Icon name={p.icon} size={22} />
        </span>
        <div>
          <h2>{p.name}</h2>
          <p className="muted small">
            {mode === 'route' && p.along !== undefined
              ? `bei km ${(p.along / 1000).toFixed(1).replace('.', ',')} · ${p.offset < 40 ? 'direkt an der Route' : `${Math.round(p.offset)} m abseits`}`
              : `${formatKm(p.offset)} Luftlinie vom Start`}
          </p>
        </div>
        <button className="ghost" onClick={() => st().setActivePoi(null)} aria-label="Schließen">
          <Icon name="x" />
        </button>
      </div>
      {details.length > 0 && (
        <ul className="poi-details">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      <div className="poi-actions">
        {mode === 'route' && route && (
          <button className="primary" onClick={insert}>
            <Icon name="plus" /> Als Wegpunkt einfügen
          </button>
        )}
        {mode === 'explore' && (
          <>
            <button className="primary" onClick={() => routeTo(true)} disabled={!start}>
              <Icon name="rotate-ccw" /> Runde über dieses Ziel
            </button>
            <button onClick={() => routeTo(false)} disabled={!start}>
              <Icon name="arrow-right" /> Route hierher
            </button>
          </>
        )}
      </div>
      <div className="poi-links">
        <a href={`https://www.openstreetmap.org/${p.id}`} target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat.toFixed(6)},${lng.toFixed(6)}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          Google Maps
        </a>
        {/^https?:\/\//i.test(p.tags.website ?? '') && (
          <a href={p.tags.website} target="_blank" rel="noreferrer">
            Website
          </a>
        )}
        {/^[a-z-]{2,12}:./.test(p.tags.wikipedia ?? '') && (
          <a
            href={`https://${p.tags.wikipedia.split(':')[0]}.wikipedia.org/wiki/${encodeURIComponent(p.tags.wikipedia.split(':').slice(1).join(':'))}`}
            target="_blank"
            rel="noreferrer"
          >
            Wikipedia
          </a>
        )}
      </div>
    </div>
  );
}
