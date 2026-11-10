import { useEffect, useMemo, useRef, useState } from 'react';
import { Streckenband } from './components/Streckenband';
import { LegEditor } from './components/LegEditor';
import { DensityLegend } from './components/GpsTraces';
import { MapToolbar } from './components/MapToolbar';
import { MapView, type MapApi } from './components/MapView';
import { PhotoStrip } from './components/PhotoStrip';
import { PoiCard } from './components/PoiCard';
import { SelectionBar } from './components/SelectionBar';
import { Sidebar } from './components/Sidebar';
import { sliceLine, type LngLat } from './domain/geo';
import { uncertainSections } from './domain/surfaceCheck';
import { useHeat } from './api/heatStore';
import { openSharedFromHash } from './api/share';
import { estimateTime } from './domain/pace';
import { useColoring } from './hooks/useColoring';
import { usePace } from './hooks/usePace';
import { useRouting } from './hooks/useRouting';
import { useStops } from './hooks/useStops';
import { departureTime, useRouteRain, useWind } from './hooks/useWind';
import { redo, undo, useHistory } from './history';
import { usePwa } from './pwa';
import { useStore } from './store';
import { Icon } from './components/Icon';
import { SURFACE_CLASS, type SurfaceCat } from './domain/settings';

export default function App() {
  const { route: planned, stale, legs, loading, errors, retry } = useRouting();
  // Fahrzeit nach dem eigenen Tempo (wirkt auch auf Wind, Wetter und GPX-Zeiten)
  const pace = usePace();
  const route = useMemo(
    () => (planned && pace ? { ...planned, time: estimateTime(planned.dist, planned.ele, pace) } : planned),
    [planned, pace],
  );
  const selection = useStore((s) => s.selection);
  const colorMode = useStore((s) => s.colorMode);
  const editingLeg = useStore((s) => s.editingLeg);
  const mapApi = useRef<MapApi | null>(null);
  const mode = useStore((s) => s.mode);
  const showPhotos = useStore((s) => s.showPhotos);
  const departure = departureTime(useStore((s) => s.departure));
  const waypoints = useStore((s) => s.waypoints);
  const loopStart = useStore((s) => s.loopStart);
  const [panelOpen, setPanelOpen] = useState(true);
  const notice = useHistory((s) => s.notice);
  const hasAvoids = useStore((s) => Object.values(s.overrides).some((o) => o.avoid?.length));

  // Wind am Start der Route bzw. am Rundtour-Startpunkt
  const windPoint: LngLat | null =
    mode === 'route' ? (waypoints[0] ? [waypoints[0].lng, waypoints[0].lat] : null) : loopStart;
  const wind = useWind(windPoint);
  const heat = useHeat((s) => s.index);
  const coloring = useColoring(route, colorMode, wind.forecast, departure, heat);
  // Beim Belag eine Zeile je Klasse („1 Asphalt, Beton“) statt doppelter Farben
  const legendItems =
    colorMode === 'surface'
      ? Object.values(
          coloring.legend.reduce<Record<string, (typeof coloring.legend)[number]>>((acc, c) => {
            const k = String(SURFACE_CLASS[c.key as SurfaceCat]);
            acc[k] = acc[k] ? { ...acc[k], label: `${acc[k].label}, ${c.label}` } : { ...c };
            return acc;
          }, {}),
        )
      : coloring.legend;
  const stops = useStops(route);
  // Regen alle ~2,5 km zur Ankunftszeit – eigener Balken im Streckenband
  const rain = useRouteRain(mode === 'route' ? route : null, departure);
  const checkedSurfaces = useStore((s) => s.checkedSurfaces);
  const sections = useMemo(() => (route ? uncertainSections(route) : []), [route]);
  const uncertainLines = useMemo(
    () =>
      route
        ? sections
            .filter((s) => !checkedSurfaces.includes(s.id))
            .map((s) => sliceLine(route.coords, route.dist, s.start, s.end))
        : [],
    [route, sections, checkedSurfaces],
  );
  const online = usePwa((s) => s.online);
  const [shareError, setShareError] = useState<string | null>(null);
  // geteilte Route aus dem Link übernehmen (beim Start und bei neuem Link im selben Tab)
  useEffect(() => {
    const open = () =>
      void openSharedFromHash().then((r) => {
        if (!r) return;
        if ('error' in r) setShareError(r.error);
        // Karte ist evtl. noch nicht bereit – kurz warten
        else setTimeout(() => mapApi.current?.fit(r.coords), 300);
      });
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
  const activeCheck = useStore((s) => s.activeCheck);
  const checkLine = useMemo(() => {
    const s = route && sections.find((x) => x.id === activeCheck);
    return route && s ? sliceLine(route.coords, route.dist, s.start, s.end) : null;
  }, [route, sections, activeCheck]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName);
      // Strg/Cmd+Z = rückgängig, +Shift oder Strg+Y = wiederholen (in Eingabefeldern gilt das native Undo)
      if ((e.metaKey || e.ctrlKey) && !typing && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        if (e.key === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.key === 'h' || e.key === 'H') && !typing && !e.repeat && !e.metaKey && !e.ctrlKey) {
        const st = useStore.getState();
        st.setHideRoute(!st.hideRoute);
      }
      if (e.key === 'Escape' && !useStore.getState().activePhoto) {
        if (useStore.getState().activeCheck) {
          useStore.getState().setActiveCheck(null);
          useStore.getState().setHideRoute(false);
        }
        useStore.getState().setSelection(null);
        useStore.getState().setEditingLeg(null);
        useStore.getState().setActivePoi(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app ${panelOpen ? '' : 'panel-closed'}`}>
      <Sidebar
        route={route}
        legs={legs}
        loading={loading}
        errors={errors}
        onRetry={retry}
        fly={(c: LngLat, z?: number) => mapApi.current?.fly(c, z)}
        fit={(c: LngLat[], z?: number) => mapApi.current?.fit(c, z)}
        sections={sections}
        bounds={() => mapApi.current?.bounds() ?? null}
        coloring={coloring}
        wind={wind}
        stops={stops}
        fitSuggestion={(id) => {
          const s = useStore.getState().suggestions;
          const coords = id === 'all' ? s.flatMap((x) => x.leg.coords) : s.find((x) => x.id === id)?.leg.coords;
          if (coords) mapApi.current?.fit(coords);
        }}
      />
      <main className="main">
        <div className="map-area">
          <MapView
            route={route}
            stale={stale}
            pieces={coloring.pieces}
            uncertain={mode === 'route' ? uncertainLines : []}
            checkLine={mode === 'route' ? checkLine : null}
            onMapApi={(api) => (mapApi.current = api)}
          />
          <button
            className="panel-toggle"
            onClick={() => setPanelOpen(!panelOpen)}
            aria-label="Seitenleiste umschalten"
          >
            <Icon name={panelOpen ? 'chevron-left' : 'chevron-right'} size={18} />
          </button>
          <MapToolbar hasRoute={!!route} bounds={() => mapApi.current?.bounds() ?? null} />
          {mode === 'route' && route && coloring.legend.length > 0 && (
            <div className="map-legend">
              {legendItems.map((c) => (
                <span key={c.key}>
                  <i
                    className={
                      c.key === 'unknown'
                        ? 'hatch'
                        : colorMode === 'surface' && SURFACE_CLASS[c.key as SurfaceCat] >= 3
                          ? 'rough'
                          : undefined
                    }
                    style={c.key === 'unknown' ? undefined : { backgroundColor: c.color }}
                  />
                  {colorMode === 'surface' && (
                    <b className="legend-class">{SURFACE_CLASS[c.key as SurfaceCat] || '?'}</b>
                  )}
                  {c.label}
                </span>
              ))}
              <span className="legend-lines">
                <svg width="22" height="6" aria-hidden>
                  <path d="M0 3h22" />
                </svg>
                berechnet
              </span>
              <span className="legend-lines">
                <svg width="22" height="6" aria-hidden>
                  <path d="M0 3h22" strokeDasharray="5 3" />
                </svg>
                rechnet
              </span>
              {hasAvoids && (
                <span className="legend-lines redline">
                  <svg width="22" height="6" aria-hidden>
                    <path d="M0 3h22" strokeDasharray="4 3" />
                  </svg>
                  umfahren
                </span>
              )}
            </div>
          )}
          {mode === 'route' && route && colorMode === 'wind' && !wind.forecast && (
            <div className="map-legend">Windvorhersage wird geladen …</div>
          )}
          <div className="bottom">
            <DensityLegend />
            {mode === 'route' && route && selection?.end != null && <SelectionBar route={route} />}
            {mode === 'route' && route && showPhotos && <PhotoStrip route={route} />}
          </div>
          {editingLeg && <LegEditor />}
          <PoiCard route={route} fit={(c) => mapApi.current?.fit(c)} />
          {!online && (
            <div className="offline-chip" role="status">
              <Icon name="cloud" size={15} /> Offline – zuletzt geplante Route und gespeicherte Karte
            </div>
          )}
          {shareError && (
            <div className="undo-toast" role="alert">
              <span>{shareError}</span>
              <button className="ghost" onClick={() => setShareError(null)} aria-label="Schließen">
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
          {notice && (
            <div className="undo-toast" role="status">
              <span>{notice}</span>
              <button onClick={undo}>Rückgängig</button>
              <button className="ghost" onClick={() => useHistory.getState().dismissNotice()} aria-label="Schließen">
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
        </div>
        {mode === 'route' && route && (
          <Streckenband route={route} climbs={coloring.climbs} legs={legs} stale={stale} rain={rain} />
        )}
      </main>
    </div>
  );
}
