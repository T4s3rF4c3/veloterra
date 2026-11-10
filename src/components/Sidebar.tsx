import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, formatKm, formatKmExact, type LngLat } from '../domain/geo';
import { downloadRoute } from '../domain/gpx';
import { breakdown, type CombinedRoute } from '../domain/route';
import { BIKE_TYPES, PRESETS, ROADS, SURFACE_CLASS, SURFACES, type CategoryInfo } from '../domain/settings';
import type { UncertainSection } from '../domain/surfaceCheck';
import { turnPoints } from '../domain/turns';
import { weatherSummary } from '../domain/weather';
import { compassLabel, windAt, type WindForecast } from '../domain/wind';
import type { Coloring } from '../hooks/useColoring';
import { useHeat } from '../api/heatStore';
import { useImport } from '../hooks/useImport';
import type { LegStatus } from '../hooks/useRouting';
import { usePace } from '../hooks/usePace';
import { departureTime, useRouteWeather } from '../hooks/useWind';
import { useStore, type Area, type Mode } from '../store';
import { SyncHint } from './Account';
import { useSite } from '../api/site';
import { AdminPanel } from './AdminPanel';
import { InstallCard } from './InstallCard';
import { ExplorePanel } from './ExplorePanel';
import { Library, SaveRow } from './Library';
import { HeatPanel } from './HeatPanel';
import { LoopPanel } from './LoopPanel';
import { NetworkPanel } from './NetworkPanel';
import { Panel } from './Panel';
import { ClimbList, StopsList } from './RouteExtras';
import { SettingsEditor } from './SettingsEditor';
import { ShareButton } from './ShareDialog';
import { SurfaceCheck } from './SurfaceCheck';
import { WeatherAlong, WindCard } from './WindCard';
import { Icon, type IconName } from './Icon';

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
/** Schotter, Kopfstein, unbefestigt: wie auf der Karte mit Strich-Textur */
const isRough = (key: string) => ((SURFACE_CLASS as Record<string, number>)[key] ?? 0) >= 3;

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
      <div className="cap">{label}</div>
      <div className="bar">
        {items.map((c) => (
          <span
            key={c.key}
            className={c.key === 'unknown' ? 'hatch' : isRough(c.key) ? 'rough' : undefined}
            style={{
              width: `${((parts[c.key] ?? 0) / total) * 100}%`,
              backgroundColor: c.key === 'unknown' ? undefined : c.color,
            }}
            title={`${c.label}: ${formatKm(parts[c.key] ?? 0)}`}
          />
        ))}
      </div>
      <div className="bar-legend">
        {shown.map((c) => (
          <span key={c.key}>
            <i
              className={c.key === 'unknown' ? 'hatch' : isRough(c.key) ? 'rough' : undefined}
              style={c.key === 'unknown' ? undefined : { backgroundColor: c.color }}
            />
            {c.label}
            <b>{Math.round(((parts[c.key] ?? 0) / total) * 100)} %</b>
          </span>
        ))}
        {sorted.length > 3 && (
          <button className="link more-link" onClick={() => setAll(!all)}>
            {all ? 'weniger anzeigen' : `+${sorted.length - 3} weitere`}
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
                  <Icon name="plus" size={14} />
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
        <Icon name="download" /> GPX exportieren
      </button>
      <button
        className="primary more-btn"
        disabled={!route}
        onClick={() => setOpen(!open)}
        aria-label="Weitere Formate"
        aria-expanded={open}
      >
        <Icon name="chevron-down" />
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
        <Icon name="upload" size={18} />
        <span className="tile-label">{busy ? 'Lädt …' : 'GPX laden'}</span>
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

/** Arbeitsbereiche oben, persönliche Bereiche (Meine, Login) unten */
const AREAS: { value: Area; label: string; hint: string }[] = [
  { value: 'plan', label: 'Planen', hint: 'Route planen und bearbeiten' },
  { value: 'discover', label: 'Entdecken', hint: 'Rundtouren, Ziele und beschilderte Radwege' },
  { value: 'profile', label: 'Profil', hint: 'Radtyp und Routing-Einstellungen' },
  { value: 'mine', label: 'Meine', hint: 'Gespeicherte Routen, eigene Heatmap und dein Tempo' },
  { value: 'admin', label: 'Login', hint: 'Anmelden, Konto und Sync – für Admins auch Server und Konten' },
];

const DISCOVER: { value: Exclude<Mode, 'route'>; label: string; hint: string }[] = [
  { value: 'loop', label: 'Rundtour', hint: 'Runden ab einem Startpunkt vorschlagen lassen' },
  { value: 'explore', label: 'Ziele', hint: 'Aussichtspunkte, Gipfel, Seen, Cafés in der Umgebung' },
  { value: 'network', label: 'Radwege', hint: 'Beschilderte Rad- und MTB-Routen' },
];

const AREA_TITLE: Record<Area, string> = {
  plan: 'Route planen',
  discover: 'Entdecken',
  mine: 'Meine Daten',
  profile: 'Profil',
  admin: 'Login',
};

const AREA_ICON: Record<Area, IconName> = {
  plan: 'route',
  discover: 'compass',
  mine: 'folder',
  profile: 'bike',
  admin: 'user',
};

/** Kennzahl mit kleiner gesetzter Einheit („87 km“ → 87 + km). */
function Stat({ value, label, hint }: { value: string | null; label: string; hint?: string }) {
  const [num, unit] = value ? value.split(' ') : ['–'];
  return (
    <div title={hint}>
      <small className="cap">{label}</small>
      <b>
        {num}
        {unit && <span>{unit}</span>}
      </b>
    </div>
  );
}

/** Wegpunkte als Liste mit km-Stand: anspringen und einzeln entfernen. */
function WaypointList({ route, fly }: { route: CombinedRoute | null; fly: (c: LngLat, z?: number) => void }) {
  const waypoints = useStore((s) => s.waypoints);
  const st = useStore.getState;
  const ranges = route && route.legRanges.length === waypoints.length - 1 ? route.legRanges : null;
  return (
    <ol className="waypoints" aria-label="Wegpunkte">
      {waypoints.map((wp, i) => {
        const last = i === waypoints.length - 1;
        const mark = i === 0 ? 'A' : last ? 'B' : String(i);
        const label = i === 0 ? 'Start' : last ? 'Ziel' : `Zwischenpunkt ${i}`;
        const km = ranges ? (i === 0 ? 0 : route!.dist[ranges[i - 1].to]) : null;
        return (
          <li key={wp.id}>
            <button className="wp-row" onClick={() => fly([wp.lng, wp.lat], 14)} title="Auf der Karte zeigen">
              <i className={i === 0 ? 'start' : last ? 'end' : ''}>{mark}</i>
              <span>{label}</span>
              {km !== null && <em>{formatKmExact(km)}</em>}
            </button>
            <button
              className="mini ghost"
              onClick={() => st().removeWaypoint(wp.id)}
              aria-label={`${label} entfernen`}
              title="Entfernen"
            >
              <Icon name="x" size={14} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Radtyp und Profil – immer sichtbar, ein Klick führt in die Einstellungen. */
function ProfilePill() {
  const settings = useStore((s) => s.settings);
  const presetId = useStore((s) => s.presetId);
  const area = useStore((s) => s.area);
  const bike = BIKE_TYPES.find((b) => b.key === (settings.bike ?? 'road'))!;
  const preset = PRESETS.find((p) => p.id === presetId);
  return (
    <button
      className={`profile-pill ${area === 'profile' ? 'on' : ''}`}
      onClick={() => useStore.getState().setArea('profile')}
      title="Radtyp und Routing-Einstellungen"
    >
      <Icon name="bike" size={20} />
      <span className="profile-pill-text">
        <b>{bike.label}</b>
        <small>{!preset ? 'eigene Einstellungen' : preset.label === bike.label ? 'Standard' : preset.label}</small>
      </span>
    </button>
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
  bounds,
  fitSuggestion,
  coloring,
  wind,
  stops,
}: Props) {
  const mode = useStore((s) => s.mode);
  const area = useStore((s) => s.area);
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
  const user = useSite((s) => s.user);
  const pace = usePace();
  const st = useStore.getState;

  const total = route ? route.dist[route.dist.length - 1] : 0;
  const parts = route ? breakdown(route) : null;
  const isImport = (k: string) => overrides[k]?.presetLabel === 'Import';
  // importierte Etappen nur listen, wenn zusätzlich umfahren/Alternative gewählt wurde
  const overrideLegs = legs.filter(
    (l) => overrides[l.key] && (!isImport(l.key) || overrides[l.key].avoid?.length || overrides[l.key].alternative),
  );
  const importLegs = legs.filter((l) => isImport(l.key));
  const w = wind.forecast ? windAt(wind.forecast, departure) : null;
  const weather = useRouteWeather(area === 'plan' ? route : null, departure);
  const novelty = useMemo(() => (route && heat && heat.size ? heat.novelty(route.coords) : null), [route, heat]);

  return (
    <aside className="sidebar">
      <nav className="rail" aria-label="Bereiche">
        <img className="rail-logo" src="/icon.svg" alt="Veloterra" />
        {AREAS.map((a) => {
          // angemeldet: Login wird zum Konto (Anfangsbuchstabe statt Symbol)
          const account = a.value === 'admin' && user;
          return (
            <button
              key={a.value}
              className={`${area === a.value ? 'on' : ''} ${a.value === 'mine' ? 'rail-end' : ''}`}
              onClick={() => st().setArea(a.value)}
              title={account ? `Angemeldet als ${user.name} – Konto und Sync` : a.hint}
              aria-current={area === a.value ? 'page' : undefined}
            >
              <span className="rail-pill">
                {account ? (
                  <span className="rail-avatar" aria-hidden>
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                ) : (
                  <Icon name={AREA_ICON[a.value]} size={20} />
                )}
              </span>
              {account ? 'Konto' : a.label}
            </button>
          );
        })}
      </nav>

      <div className="pane">
        <header className="pane-head">
          <h1>{area === 'admin' && user ? 'Konto' : AREA_TITLE[area]}</h1>
          {area !== 'profile' && area !== 'admin' && <ProfilePill />}
        </header>

        {/* ===== Planen ===== */}
        {area === 'plan' && (
          <>
            <Search fly={fly} />
            <section className="card summary">
              {waypoints.length < 2 ? (
                <div className="empty">
                  <p>
                    <b>Auf die Karte klicken</b>, um Start und Ziel zu setzen. Jeder weitere Klick fügt einen
                    Zwischenpunkt hinzu.
                  </p>
                  <div className="empty-actions">
                    <button onClick={() => st().setMode('loop')}>Rundtour vorschlagen lassen</button>
                    <button onClick={() => st().setMode('network')}>Beschildertem Radweg folgen</button>
                  </div>
                </div>
              ) : (
                <>
                  <WaypointList route={route} fly={fly} />
                  <div className="stats">
                    <Stat label="Distanz" value={route ? `${formatKmExact(total)} km` : null} />
                    <Stat label="Anstieg" value={route ? `${Math.round(route.ascend)} hm` : null} />
                    <Stat
                      label={pace ? 'Deine Zeit' : 'Fahrzeit'}
                      value={route ? formatDuration(route.time) : null}
                      hint={
                        pace
                          ? `Nach deinem Tempo aus ${pace.rides} eigenen Fahrten (flach ${Math.round(pace.speeds.flat)} km/h)`
                          : 'Schätzung von BRouter – mit eigenen Fahrten unter „Meine“ wird es dein Tempo'
                      }
                    />
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
                  {route && novelty !== null && (
                    <div
                      className="novelty-line"
                      title="Anteil der Route, den du laut deiner Heatmap noch nie gefahren bist"
                    >
                      <b>{Math.round(novelty * 100)} %</b> neu für dich
                    </div>
                  )}
                  {parts && total > 0 && (
                    <div className="mix">
                      <Bar parts={parts.surface} cats={SURFACES} total={total} label="Belag" />
                      <Bar parts={parts.road} cats={ROADS} total={total} label="Straßenart" />
                    </div>
                  )}
                  {route && <SurfaceCheck route={route} sections={sections} fit={fit} />}
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
                <button
                  onClick={() => st().closeLoop()}
                  disabled={waypoints.length < 2}
                  title="Zurück zum Start fahren"
                >
                  <Icon name="rotate-ccw" size={18} />
                  <span className="tile-label">Zum Start</span>
                </button>
                <button onClick={() => st().reverse()} disabled={waypoints.length < 2} title="Richtung umkehren">
                  <Icon name="swap" size={18} />
                  <span className="tile-label">Umkehren</span>
                </button>
                <button
                  onClick={() => {
                    const wp = st().waypoints;
                    if (wp.length) st().removeWaypoint(wp[wp.length - 1].id);
                  }}
                  disabled={!waypoints.length}
                  title="Letzten Wegpunkt entfernen"
                >
                  <Icon name="backspace" size={18} />
                  <span className="tile-label">Letzten löschen</span>
                </button>
                <button onClick={() => st().clearRoute()} disabled={!waypoints.length} title="Route leeren">
                  <Icon name="x" size={18} />
                  <span className="tile-label">Route leeren</span>
                </button>
                <ImportButton fit={fit} />
              </div>
              {waypoints.length >= 2 && (
                <div className="route-footer">
                  <SaveRow route={route} />
                  <div className="footer-actions">
                    <ShareButton disabled={!route} />
                    <ExportMenu route={route} name={routeName} />
                  </div>
                </div>
              )}
            </section>

            {route && (
              <div className="panel-group">
                <Panel
                  id="wind"
                  icon="cloud-sun"
                  title="Wetter & Wind"
                  summary={
                    [
                      weather.points && weatherSummary(weather.points),
                      w && `Wind ${Math.round(w.speed)} km/h aus ${compassLabel(w.from)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Vorhersage zur Abfahrtszeit'
                  }
                >
                  <WindCard
                    forecast={wind.forecast}
                    error={wind.error}
                    summary={coloring.wind}
                    start={waypoints[0] ? [waypoints[0].lng, waypoints[0].lat] : null}
                    duration={route.time}
                  />
                  <WeatherAlong points={weather.points} error={weather.error} />
                </Panel>
                <ClimbList climbs={coloring.climbs} route={route} fit={fit} />
                {showStops && (
                  <StopsList loading={stops.loading} error={stops.error} partial={stops.partial} fly={fly} />
                )}
                {overrideLegs.length > 0 && (
                  <Panel
                    id="overrides"
                    icon="pencil"
                    title="Angepasste Etappen"
                    badge={overrideLegs.length}
                    summary="umfahren, anders geplant, Alternativen"
                    defaultOpen
                  >
                    <ul className="list">
                      {overrideLegs.map((l) => {
                        const o = overrides[l.key];
                        const tags = [
                          isImport(l.key) ? 'importiert' : o.settings && 'eigene Einstellungen',
                          o.avoid?.length && `${o.avoid.length}× umfahren`,
                          o.alternative && `Alternative ${o.alternative}`,
                        ].filter(Boolean);
                        return (
                          <li key={l.key}>
                            <span>
                              <b>Etappe {l.index + 1}</b>
                              <small>{tags.join(', ')}</small>
                            </span>
                            {o.settings && !isImport(l.key) && (
                              <button className="mini" onClick={() => st().setEditingLeg(l.key)} title="Bearbeiten">
                                <Icon name="pencil" size={14} />
                              </button>
                            )}
                            <button
                              className="mini"
                              onClick={() =>
                                // bei Importen nur Umfahren/Alternative zurücknehmen, der Track bleibt
                                st().setOverride(
                                  l.key,
                                  isImport(l.key) ? { settings: o.settings, presetLabel: o.presetLabel } : null,
                                )
                              }
                              title="Zurücksetzen"
                            >
                              <Icon name="x" size={14} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                )}
              </div>
            )}
          </>
        )}

        {/* ===== Entdecken ===== */}
        {area === 'discover' && (
          <>
            <div className="seg-tabs" role="tablist" aria-label="Entdecken">
              {DISCOVER.map((d) => (
                <button
                  key={d.value}
                  role="tab"
                  aria-selected={mode === d.value}
                  className={mode === d.value ? 'on' : ''}
                  onClick={() => st().setMode(d.value)}
                  title={d.hint}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {mode !== 'network' && <Search fly={fly} />}
            {mode === 'loop' && <LoopPanel onFit={fitSuggestion} wind={wind} />}
            {mode === 'explore' && <ExplorePanel fly={fly} fit={fit} />}
            {mode === 'network' && <NetworkPanel bounds={bounds} fit={fit} />}
          </>
        )}

        {/* ===== Meine Daten ===== */}
        {area === 'mine' && (
          <>
            <SyncHint />
            <div className="panel-group">
              <Library route={route} fit={fit} />
              <HeatPanel />
            </div>
            <InstallCard />
          </>
        )}

        {/* ===== Admin ===== */}
        {area === 'admin' && <AdminPanel bounds={bounds} />}

        {/* ===== Profil ===== */}
        {area === 'profile' && (
          <>
            <section className="card">
              <SettingsEditor settings={settings} presetId={presetId} onChange={(s, id) => st().setSettings(s, id)} />
            </section>
            {blocks.length > 0 && (
              <section className="card">
                <h2 className="card-title">Immer meiden</h2>
                <ul className="list">
                  {blocks.map((b) => (
                    <li key={b.id}>
                      <span>
                        <b>{b.label}</b>
                      </span>
                      <button
                        className="mini"
                        onClick={() => {
                          st().setArea('plan');
                          fly(b.line[Math.floor(b.line.length / 2)], 14);
                        }}
                        title="Auf der Karte zeigen"
                      >
                        <Icon name="target" size={14} />
                      </button>
                      <button className="mini" onClick={() => st().removeBlock(b.id)} title="Sperre entfernen">
                        <Icon name="x" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <footer className="foot">
          Routing{' '}
          <a href="https://brouter.de" target="_blank" rel="noreferrer">
            BRouter
          </a>
          , Daten ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>
          , Karte{' '}
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
            OpenFreeMap
          </a>
          , Radrouten{' '}
          <a href="https://waymarkedtrails.org" target="_blank" rel="noreferrer">
            Waymarked Trails
          </a>
        </footer>
      </div>
    </aside>
  );
}
