import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, formatKm, type LngLat } from '../domain/geo';
import { downloadRoute } from '../domain/gpx';
import { breakdown, type CombinedRoute } from '../domain/route';
import { ROADS, SURFACES, type CategoryInfo } from '../domain/settings';
import type { UncertainSection } from '../domain/surfaceCheck';
import { turnPoints } from '../domain/turns';
import type { WindForecast } from '../domain/wind';
import type { Coloring } from '../hooks/useColoring';
import { useImport } from '../hooks/useImport';
import type { LegStatus } from '../hooks/useRouting';
import { useStore } from '../store';
import { ExplorePanel } from './ExplorePanel';
import { Library } from './Library';
import { LoopPanel } from './LoopPanel';
import { ClimbList, StopsList } from './RouteExtras';
import { SettingsEditor } from './SettingsEditor';
import { SurfaceCheck } from './SurfaceCheck';
import { WindCard } from './WindCard';

interface Props {
  route: CombinedRoute | null;
  legs: LegStatus[];
  loading: boolean;
  errors: LegStatus[];
  onRetry: () => void;
  fly: (c: LngLat, zoom?: number) => void;
  fit: (c: LngLat[], maxZoom?: number) => void;
  sections: UncertainSection[];
  fitSuggestion: (id: string) => void;
  coloring: Coloring;
  wind: { forecast: WindForecast | null; error: string | null };
  stops: { loading: boolean; error: string | null; partial: boolean };
}

function Bar<K extends string>({
  parts,
  cats,
  total,
}: {
  parts: Partial<Record<K, number>>;
  cats: CategoryInfo<K>[];
  total: number;
}) {
  const items = cats.filter((c) => (parts[c.key] ?? 0) > 0);
  return (
    <div>
      <div className="bar">
        {items.map((c) => (
          <span
            key={c.key}
            style={{ width: `${((parts[c.key] ?? 0) / total) * 100}%`, background: c.color }}
            title={`${c.label}: ${formatKm(parts[c.key] ?? 0)}`}
          />
        ))}
      </div>
      <div className="bar-legend">
        {items
          .sort((a, b) => (parts[b.key] ?? 0) - (parts[a.key] ?? 0))
          .map((c) => (
            <span key={c.key}>
              <i style={{ background: c.color }} />
              {c.label} <b>{formatKm(parts[c.key] ?? 0)}</b>
            </span>
          ))}
      </div>
    </div>
  );
}

interface PhotonFeature {
  geometry: { coordinates: LngLat };
  properties: { name?: string; city?: string; state?: string; country?: string; street?: string; housenumber?: string };
}

function Search({ fly }: { fly: Props['fly'] }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const view = useStore((s) => s.view);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    timer.current = window.setTimeout(async () => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=de&limit=5&lon=${view.center[0]}&lat=${view.center[1]}`;
        const res = await fetch(url, { signal: ctrl.signal });
        const json = await res.json();
        setResults(json.features ?? []);
      } catch {
        /* ignorieren */
      }
    }, 300);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const label = (f: PhotonFeature) => {
    const p = f.properties;
    const main = p.name ?? [p.street, p.housenumber].filter(Boolean).join(' ');
    return { main, sub: [p.city, p.state, p.country].filter((x) => x && x !== main).join(', ') };
  };

  return (
    <div className="search">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ort suchen …"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            fly(results[0].geometry.coordinates);
            setResults([]);
          }
        }}
      />
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((f, i) => {
            const l = label(f);
            return (
              <li key={i}>
                <button
                  onClick={() => {
                    fly(f.geometry.coordinates);
                    setResults([]);
                    setQ(l.main);
                  }}
                >
                  <span>{l.main}</span>
                  <small>{l.sub}</small>
                </button>
                <button
                  className="mini"
                  title={useStore.getState().mode !== 'route' ? 'Als Startpunkt setzen' : 'Als Wegpunkt hinzufügen'}
                  onClick={() => {
                    const st = useStore.getState();
                    if (st.mode !== 'route') st.setLoopStart(f.geometry.coordinates);
                    else st.addWaypoint(f.geometry.coordinates);
                    fly(f.geometry.coordinates, 12);
                    setResults([]);
                    setQ('');
                  }}
                >
                  ＋
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Export-Knöpfe: GPX mit Abbiegehinweisen, TCX für Garmin */
function ExportButtons({ route, name }: { route: CombinedRoute | null; name: string }) {
  const turns = useMemo(() => (route ? turnPoints(route).length : 0), [route]);
  const label = name.trim() || (route ? `Route ${formatKm(route.length)}` : 'Route');
  return (
    <div className="export">
      <button className="primary" disabled={!route} onClick={() => route && downloadRoute(route, label, 'gpx')}>
        GPX exportieren
      </button>
      <button
        disabled={!route}
        onClick={() => route && downloadRoute(route, label, 'tcx')}
        title="TCX-Kurs mit Abbiegehinweisen – ideal für Garmin Edge"
      >
        TCX
      </button>
      <button
        className="ghost mini"
        disabled={!route}
        onClick={() => route && downloadRoute(route, label, 'gpx-plain')}
        title="GPX nur mit der Strecke, ohne Abbiegepunkte"
      >
        ohne Hinweise
      </button>
      {route && turns > 0 && <small className="muted">inkl. {turns} Abbiegehinweise für Garmin, Wahoo & Co.</small>}
    </div>
  );
}

function ImportButton({ fit }: { fit: (c: LngLat[]) => void }) {
  const { importFile, busy, error } = useImport();
  const input = useRef<HTMLInputElement>(null);
  const run = async (f: File) => {
    await importFile(f);
    const t = useStore.getState().importTrack;
    if (t) fit(t.coords);
  };
  useEffect(() => {
    // Datei auf die Karte ziehen
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files[0];
      if (!f || !/\.gpx$/i.test(f.name)) return;
      e.preventDefault();
      run(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        title="GPX-Datei laden (oder auf die Karte ziehen)"
      >
        {busy ? 'Importiere …' : '⇪ GPX importieren'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".gpx,application/gpx+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run(f);
          e.target.value = '';
        }}
      />
      {error && <div className="error wide">{error}</div>}
    </>
  );
}

export function Sidebar({
  route,
  legs,
  loading,
  errors,
  onRetry,
  fly,
  fit,
  sections,
  fitSuggestion,
  coloring,
  wind,
  stops,
}: Props) {
  const mode = useStore((s) => s.mode);
  const waypoints = useStore((s) => s.waypoints);
  const settings = useStore((s) => s.settings);
  const presetId = useStore((s) => s.presetId);
  const overrides = useStore((s) => s.overrides);
  const blocks = useStore((s) => s.blocks);
  const showStops = useStore((s) => s.showStops);
  const importTrack = useStore((s) => s.importTrack);
  const routeName = useStore((s) => s.routeName);
  const st = useStore.getState;

  const total = route ? route.dist[route.dist.length - 1] : 0;
  const parts = route ? breakdown(route) : null;
  const isImport = (k: string) => overrides[k]?.presetLabel === 'Import';
  // importierte Etappen nur listen, wenn zusätzlich umgangen/Alternative gewählt wurde
  const overrideLegs = legs.filter(
    (l) => overrides[l.key] && (!isImport(l.key) || overrides[l.key].avoid?.length || overrides[l.key].alternative),
  );
  const importLegs = legs.filter((l) => isImport(l.key));

  return (
    <aside className="sidebar">
      <header className="brand">
        <span className="logo">◐</span>
        <div>
          <h1>Veloterra</h1>
          <p>Routen nach Belag & Straßenart – Rennrad, Gravel, MTB</p>
        </div>
      </header>

      <div className="choice tabs">
        <button className={mode === 'route' ? 'on' : ''} onClick={() => st().setMode('route')}>
          Route planen
        </button>
        <button className={mode === 'loop' ? 'on' : ''} onClick={() => st().setMode('loop')}>
          Rundtour
        </button>
        <button className={mode === 'explore' ? 'on' : ''} onClick={() => st().setMode('explore')}>
          Ziele
        </button>
      </div>

      <Search fly={fly} />

      {mode === 'loop' && <LoopPanel onFit={fitSuggestion} wind={wind} />}
      {mode === 'explore' && <ExplorePanel fly={fly} fit={fit} />}

      {mode === 'route' && (
        <section className="card">
          {waypoints.length < 2 ? (
            <p className="muted">
              Klicke auf die Karte, um <b>Start</b> und <b>Ziel</b> zu setzen. Weitere Klicks fügen Etappen hinzu. Oder
              eine Tour aus Komoot, Strava & Co. als GPX importieren.
            </p>
          ) : (
            <>
              <div className="stats">
                <div>
                  <b>{route ? formatKm(route.length) : '–'}</b>
                  <small>Distanz</small>
                </div>
                <div>
                  <b>{route ? `${Math.round(route.ascend)} m` : '–'}</b>
                  <small>Anstieg</small>
                </div>
                <div>
                  <b>{route ? formatDuration(route.time) : '–'}</b>
                  <small>Fahrzeit ca.</small>
                </div>
                {loading && <span className="spinner" title="Route wird berechnet" />}
              </div>
              {errors.length > 0 && (
                <div className="error">
                  {errors.map((e) => (
                    <p key={e.key}>
                      Etappe {e.index + 1}: {e.error}
                    </p>
                  ))}
                  <button onClick={onRetry}>Erneut versuchen</button>
                </div>
              )}
              {parts && total > 0 && (
                <>
                  <h3>Untergrund</h3>
                  <Bar parts={parts.surface} cats={SURFACES} total={total} />
                  <h3>Straßenart</h3>
                  <Bar parts={parts.road} cats={ROADS} total={total} />
                </>
              )}
              {importLegs.length > 0 && (
                <div className="import-note">
                  <span>
                    <b>Importiert{importTrack ? `: ${importTrack.name}` : ''}</b>
                    <small>
                      Folgt dem Original{importTrack ? ' (lila gestrichelt)' : ''}. Verschobene Punkte werden ohne
                      Vorlieben geroutet.
                    </small>
                  </span>
                  <button
                    className="mini"
                    onClick={() => importLegs.forEach((l) => st().setOverride(l.key, null))}
                    title="Alle Etappen mit deinem Routing-Profil neu berechnen"
                  >
                    Mit meinem Profil planen
                  </button>
                </div>
              )}
              {route && (
                <>
                  <h3>Wind</h3>
                  <WindCard forecast={wind.forecast} error={wind.error} summary={coloring.wind} />
                </>
              )}
            </>
          )}
          <div className="actions">
            <button onClick={() => st().closeLoop()} disabled={waypoints.length < 2} title="Zurück zum Start">
              ↺ Rundtour
            </button>
            <button onClick={() => st().reverse()} disabled={waypoints.length < 2}>
              ⇅ Umkehren
            </button>
            <button
              onClick={() => {
                const wp = st().waypoints;
                if (wp.length) st().removeWaypoint(wp[wp.length - 1].id);
              }}
              disabled={!waypoints.length}
            >
              ↶ Letzten Punkt
            </button>
            <button onClick={() => st().clearRoute()} disabled={!waypoints.length}>
              Leeren
            </button>
            <ImportButton fit={fit} />
          </div>
          {waypoints.length >= 2 && <ExportButtons route={route} name={routeName} />}
        </section>
      )}

      {mode === 'route' && route && <SurfaceCheck route={route} sections={sections} fit={fit} />}
      {mode === 'route' && route && <ClimbList climbs={coloring.climbs} route={route} fit={fit} />}
      {mode === 'route' && route && showStops && (
        <StopsList loading={stops.loading} error={stops.error} partial={stops.partial} fly={fly} />
      )}
      {mode === 'route' && <Library route={route} fit={fit} />}

      {mode === 'route' && overrideLegs.length > 0 && (
        <section className="card">
          <h2>Angepasste Etappen</h2>
          <ul className="list">
            {overrideLegs.map((l) => {
              const o = overrides[l.key];
              const tags = [
                isImport(l.key) ? 'importiert' : o.settings && 'eigene Einstellungen',
                o.avoid?.length && `${o.avoid.length}× umgangen`,
                o.alternative && `Alternative ${o.alternative}`,
              ].filter(Boolean);
              return (
                <li key={l.key}>
                  <span>
                    <b>Etappe {l.index + 1}</b>
                    <small>{tags.join(' · ')}</small>
                  </span>
                  {o.settings && !isImport(l.key) && (
                    <button className="mini" onClick={() => st().setEditingLeg(l.key)} title="Bearbeiten">
                      ✎
                    </button>
                  )}
                  <button
                    className="mini"
                    onClick={() =>
                      // bei Importen nur Umgehen/Alternative zurücknehmen, der Track bleibt
                      st().setOverride(
                        l.key,
                        isImport(l.key) ? { settings: o.settings, presetLabel: o.presetLabel } : null,
                      )
                    }
                    title="Zurücksetzen"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Routing-Profil</h2>
        <SettingsEditor settings={settings} presetId={presetId} onChange={(s, id) => st().setSettings(s, id)} />
      </section>

      {blocks.length > 0 && (
        <section className="card">
          <h2>Immer meiden</h2>
          <ul className="list">
            {blocks.map((b) => (
              <li key={b.id}>
                <span>
                  <b>{b.label}</b>
                </span>
                <button className="mini" onClick={() => fly(b.line[Math.floor(b.line.length / 2)], 14)} title="Zeigen">
                  ◎
                </button>
                <button className="mini" onClick={() => st().removeBlock(b.id)} title="Entfernen">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="foot">
        Routing:{' '}
        <a href="https://brouter.de" target="_blank" rel="noreferrer">
          BRouter
        </a>{' '}
        · Daten ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        · Karte{' '}
        <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
          OpenFreeMap
        </a>
      </footer>
    </aside>
  );
}
