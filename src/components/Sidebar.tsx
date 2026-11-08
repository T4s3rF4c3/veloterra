import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, formatKm, type LngLat } from '../domain/geo';
import { downloadRoute } from '../domain/gpx';
import { breakdown, type CombinedRoute } from '../domain/route';
import { BIKE_TYPES, PRESETS, ROADS, SURFACES, type CategoryInfo } from '../domain/settings';
import type { UncertainSection } from '../domain/surfaceCheck';
import { turnPoints } from '../domain/turns';
import { compassLabel, windAt, type WindForecast } from '../domain/wind';
import type { Coloring } from '../hooks/useColoring';
import { useHeat } from '../api/heatStore';
import { useImport } from '../hooks/useImport';
import type { LegStatus } from '../hooks/useRouting';
import { departureTime } from '../hooks/useWind';
import { useStore, type Mode } from '../store';
import { ExplorePanel } from './ExplorePanel';
import { Library } from './Library';
import { HeatPanel } from './HeatPanel';
import { LoopPanel } from './LoopPanel';
import { NetworkPanel } from './NetworkPanel';
import { Panel } from './Panel';
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
  bounds: () => [number, number, number, number] | null;
  fitSuggestion: (id: string) => void;
  coloring: Coloring;
  wind: { forecast: WindForecast | null; error: string | null };
  stops: { loading: boolean; error: string | null; partial: boolean };
}

/** Anteile als Balken; Legende zeigt die drei größten, Rest aufklappbar. */
function Bar<K extends string>({
  parts,
  cats,
  total,
  label,
}: {
  parts: Partial<Record<K, number>>;
  cats: CategoryInfo<K>[];
  total: number;
  label: string;
}) {
  const [all, setAll] = useState(false);
  const items = cats.filter((c) => (parts[c.key] ?? 0) > 0);
  const sorted = [...items].sort((a, b) => (parts[b.key] ?? 0) - (parts[a.key] ?? 0));
  const shown = all ? sorted : sorted.slice(0, 3);
  return (
    <div className="mix-row">
      <div className="mix-label">{label}</div>
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
        {shown.map((c) => (
          <span key={c.key}>
            <i style={{ background: c.color }} />
            {c.label} <b>{Math.round(((parts[c.key] ?? 0) / total) * 100)} %</b>
          </span>
        ))}
        {sorted.length > 3 && (
          <button className="link" onClick={() => setAll(!all)}>
            {all ? 'weniger' : `+${sorted.length - 3}`}
          </button>
        )}
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

/** Export: ein Knopf, Formate im Menü */
function ExportMenu({ route, name }: { route: CombinedRoute | null; name: string }) {
  const turns = useMemo(() => (route ? turnPoints(route).length : 0), [route]);
  const label = name.trim() || (route ? `Route ${formatKm(route.length)}` : 'Route');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);
  const run = (f: 'gpx' | 'tcx' | 'gpx-plain') => {
    if (route) downloadRoute(route, label, f);
    setOpen(false);
  };
  return (
    <div className="export-menu" ref={ref}>
      <button className="primary" disabled={!route} onClick={() => run('gpx')} title="GPX mit Abbiegehinweisen">
        ⤓ GPX exportieren
      </button>
      <button
        className="primary more-btn"
        disabled={!route}
        onClick={() => setOpen(!open)}
        aria-label="Weitere Formate"
        aria-expanded={open}
      >
        ▾
      </button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => run('gpx')}>
            <b>GPX</b>
            <small>mit {turns} Abbiegehinweisen – Garmin, Wahoo, Komoot …</small>
          </button>
          <button role="menuitem" onClick={() => run('tcx')}>
            <b>TCX-Kurs</b>
            <small>Abbiegehinweise als CoursePoints – ideal für Garmin Edge</small>
          </button>
          <button role="menuitem" onClick={() => run('gpx-plain')}>
            <b>GPX ohne Hinweise</b>
            <small>nur die Strecke</small>
          </button>
        </div>
      )}
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
        <span aria-hidden>⇪</span>
        {busy ? 'Lädt …' : 'Import'}
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

const MODE_TABS: { value: Mode; icon: string; label: string; hint: string }[] = [
  { value: 'route', icon: '🧭', label: 'Route', hint: 'Route planen und bearbeiten' },
  { value: 'loop', icon: '↺', label: 'Rundtour', hint: 'Rundtouren vorschlagen lassen' },
  { value: 'explore', icon: '📍', label: 'Ziele', hint: 'Ausflugsziele in der Umgebung' },
  { value: 'network', icon: '🚲', label: 'Radwege', hint: 'Beschilderte Rad- und MTB-Routen' },
];

export function Sidebar({
  route,
  legs,
  loading,
  errors,
  onRetry,
  fly,
  fit,
  sections,
  bounds,
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
  const departure = departureTime(useStore((s) => s.departure));
  const heat = useHeat((s) => s.index);
  const st = useStore.getState;

  const total = route ? route.dist[route.dist.length - 1] : 0;
  const parts = route ? breakdown(route) : null;
  const isImport = (k: string) => overrides[k]?.presetLabel === 'Import';
  // importierte Etappen nur listen, wenn zusätzlich umgangen/Alternative gewählt wurde
  const overrideLegs = legs.filter(
    (l) => overrides[l.key] && (!isImport(l.key) || overrides[l.key].avoid?.length || overrides[l.key].alternative),
  );
  const importLegs = legs.filter((l) => isImport(l.key));
  const bike = BIKE_TYPES.find((b) => b.key === (settings.bike ?? 'road'))!;
  const preset = PRESETS.find((p) => p.id === presetId);
  const w = wind.forecast ? windAt(wind.forecast, departure) : null;

  return (
    <aside className="sidebar">
      <header className="brand">
        <img className="logo" src="/icon.svg" alt="" />
        <div>
          <h1>Veloterra</h1>
          <p>Routen nach Belag & Straßenart</p>
        </div>
      </header>

      <nav className="mode-tabs" aria-label="Modus">
        {MODE_TABS.map((t) => (
          <button
            key={t.value}
            className={mode === t.value ? 'on' : ''}
            onClick={() => st().setMode(t.value)}
            title={t.hint}
            aria-current={mode === t.value}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {mode !== 'network' && <Search fly={fly} />}

      {mode === 'loop' && <LoopPanel onFit={fitSuggestion} wind={wind} />}
      {mode === 'explore' && <ExplorePanel fly={fly} fit={fit} />}
      {mode === 'network' && <NetworkPanel bounds={bounds} fit={fit} />}

      {mode === 'route' && (
        <section className="card summary">
          {waypoints.length < 2 ? (
            <div className="empty">
              <p>
                <b>Auf die Karte klicken</b>, um Start und Ziel zu setzen – jeder weitere Klick fügt einen Zwischenpunkt
                hinzu.
              </p>
              <p className="muted small">
                Oder eine Tour aus Komoot & Co. importieren, eine Rundtour vorschlagen lassen oder einer beschilderten
                Radroute folgen.
              </p>
            </div>
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
                  <small>Fahrzeit</small>
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
              {route && heat && heat.size > 0 && (
                <div
                  className="novelty-line"
                  title="Anteil der Route, den du laut deiner Heatmap noch nie gefahren bist"
                >
                  🔥 <b>{Math.round(heat.novelty(route.coords) * 100)} %</b> neu für dich
                </div>
              )}
              {parts && total > 0 && (
                <div className="mix">
                  <Bar parts={parts.surface} cats={SURFACES} total={total} label="Untergrund" />
                  <Bar parts={parts.road} cats={ROADS} total={total} label="Straßenart" />
                </div>
              )}
              {importLegs.length > 0 && (
                <div className="import-note">
                  <span>
                    <b>Importiert{importTrack ? `: ${importTrack.name}` : ''}</b>
                    <small>Folgt dem Original{importTrack ? ' (lila gestrichelt)' : ''}.</small>
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
            </>
          )}
          <div className="toolbar">
            <button onClick={() => st().closeLoop()} disabled={waypoints.length < 2} title="Zurück zum Start fahren">
              <span aria-hidden>↺</span>Zum Start
            </button>
            <button onClick={() => st().reverse()} disabled={waypoints.length < 2} title="Richtung umkehren">
              <span aria-hidden>⇅</span>Umkehren
            </button>
            <button
              onClick={() => {
                const wp = st().waypoints;
                if (wp.length) st().removeWaypoint(wp[wp.length - 1].id);
              }}
              disabled={!waypoints.length}
              title="Letzten Wegpunkt entfernen"
            >
              <span aria-hidden>⌫</span>Letzter
            </button>
            <button onClick={() => st().clearRoute()} disabled={!waypoints.length} title="Route leeren">
              <span aria-hidden>✕</span>Leeren
            </button>
            <ImportButton fit={fit} />
          </div>
          {waypoints.length >= 2 && <ExportMenu route={route} name={routeName} />}
        </section>
      )}

      {mode === 'route' && route && (
        <Panel
          id="wind"
          icon="🌬️"
          title="Wind"
          summary={
            w
              ? `${Math.round(w.speed)} km/h aus ${compassLabel(w.from)}` +
                (coloring.wind && w.speed >= 3 ? ` · ${Math.round(coloring.wind.head * 100)} % Gegenwind` : '')
              : 'Vorhersage für die Abfahrtszeit'
          }
        >
          <WindCard forecast={wind.forecast} error={wind.error} summary={coloring.wind} />
        </Panel>
      )}
      {mode === 'route' && route && <SurfaceCheck route={route} sections={sections} fit={fit} />}
      {mode === 'route' && route && <ClimbList climbs={coloring.climbs} route={route} fit={fit} />}
      {mode === 'route' && route && showStops && (
        <StopsList loading={stops.loading} error={stops.error} partial={stops.partial} fly={fly} />
      )}

      {mode === 'route' && overrideLegs.length > 0 && (
        <Panel
          id="overrides"
          icon="✎"
          title="Angepasste Etappen"
          badge={overrideLegs.length}
          summary="umgangen, anders geplant, Alternativen"
          defaultOpen
        >
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
        </Panel>
      )}

      {mode === 'route' && <Library route={route} fit={fit} />}

      {(mode === 'route' || mode === 'loop') && <HeatPanel />}

      <Panel
        id="profile"
        icon={bike.icon}
        title="Routing-Profil"
        summary={`${bike.label}${preset ? ` · ${preset.label}` : ' · eigene Einstellungen'}`}
        defaultOpen={mode !== 'route'}
      >
        <SettingsEditor settings={settings} presetId={presetId} onChange={(s, id) => st().setSettings(s, id)} />
      </Panel>

      {blocks.length > 0 && (
        <Panel id="blocks" icon="⛔" title="Immer meiden" badge={blocks.length} summary="gesperrte Abschnitte">
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
        </Panel>
      )}

      <footer className="foot">
        Routing{' '}
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
        </a>{' '}
        · Radrouten{' '}
        <a href="https://waymarkedtrails.org" target="_blank" rel="noreferrer">
          Waymarked Trails
        </a>
      </footer>
    </aside>
  );
}
