import { useEffect, useMemo, useRef, useState } from 'react';
import { ElevationChart } from './components/ElevationChart';
import { LegEditor } from './components/LegEditor';
import { MapToolbar } from './components/MapToolbar';
import { MapView, type MapApi } from './components/MapView';
import { PhotoStrip } from './components/PhotoStrip';
import { PoiCard } from './components/PoiCard';
import { SelectionBar } from './components/SelectionBar';
import { Sidebar } from './components/Sidebar';
import { sliceLine, type LngLat } from './domain/geo';
import { uncertainSections } from './domain/surfaceCheck';
import { useColoring } from './hooks/useColoring';
import { useRouting } from './hooks/useRouting';
import { useStops } from './hooks/useStops';
import { departureTime, useWind } from './hooks/useWind';
import { redo, undo, useHistory } from './history';
import { useStore } from './store';

export default function App() {
  const { route, stale, legs, loading, errors, retry } = useRouting();
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

  // Wind am Start der Route bzw. am Rundtour-Startpunkt
  const windPoint: LngLat | null =
    mode === 'route' ? (waypoints[0] ? [waypoints[0].lng, waypoints[0].lat] : null) : loopStart;
  const wind = useWind(windPoint);
  const coloring = useColoring(route, colorMode, wind.forecast, departure);
  const stops = useStops(route);
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
        <MapView
          route={route}
          stale={stale}
          pieces={coloring.pieces}
          uncertain={mode === 'route' ? uncertainLines : []}
          onMapApi={(api) => (mapApi.current = api)}
        />
        <button className="panel-toggle" onClick={() => setPanelOpen(!panelOpen)} aria-label="Seitenleiste umschalten">
          {panelOpen ? '‹' : '›'}
        </button>
        <MapToolbar hasRoute={!!route} />
        {mode === 'route' && route && coloring.legend.length > 0 && (
          <div className="map-legend">
            {coloring.legend.map((c) => (
              <span key={c.key}>
                <i style={{ background: c.color }} />
                {c.label}
              </span>
            ))}
          </div>
        )}
        {mode === 'route' && route && colorMode === 'wind' && !wind.forecast && (
          <div className="map-legend">Windvorhersage wird geladen …</div>
        )}
        <div className="bottom">
          {mode === 'route' && route && selection?.end != null && <SelectionBar route={route} />}
          {mode === 'route' && route && showPhotos && <PhotoStrip route={route} />}
          {mode === 'route' && route && (
            <ElevationChart route={route} pieces={coloring.pieces} climbs={coloring.climbs} />
          )}
        </div>
        {editingLeg && <LegEditor />}
        <PoiCard route={route} fit={(c) => mapApi.current?.fit(c)} />
        {notice && (
          <div className="undo-toast" role="status">
            <span>{notice}</span>
            <button onClick={undo}>Rückgängig</button>
            <button className="ghost" onClick={() => useHistory.getState().dismissNotice()} aria-label="Schließen">
              ✕
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
