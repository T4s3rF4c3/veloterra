import {
  GeolocateControl,
  LngLatBounds,
  Map as MlMap,
  Marker,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type MapMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { bearing, haversine, pointAtDistance, projectOnLine, sliceLine, type LngLat } from '../domain/geo';
import type { CombinedRoute } from '../domain/route';
import type { Piece } from '../hooks/useColoring';
import { useStore, type Basemap, type Suggestion } from '../store';
import { SUGGESTION_COLORS } from '../domain/roundtrip';

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

/** Luftbild (Esri World Imagery) mit Ortsnamen-Overlay */
const SATELLITE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: 'raster',
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Luftbild © Esri, Maxar, Earthstar Geographics, GIS User Community',
    },
    labels: {
      type: 'raster',
      tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery' },
    { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } },
  ],
};

/**
 * Amtliche Luftbilder (DOP, 20–40 cm) der Länder als WMS. Außerhalb des
 * Landes liefern die Dienste transparente Kacheln – darunter liegt Esri.
 */
const WMS_PARAMS =
  'SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=true';
const DOP: { id: string; url: string; layer: string; bounds: [number, number, number, number]; attribution: string }[] =
  [
    {
      id: 'dop-by',
      url: 'https://geoservices.bayern.de/od/wms/dop/v1/dop40',
      layer: 'by_dop40c',
      bounds: [8.9, 47.2, 13.9, 50.6],
      attribution: 'Luftbild Bayern © Bayerische Vermessungsverwaltung (CC BY 4.0)',
    },
    {
      id: 'dop-he',
      url: 'https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows',
      layer: 'he_dop_rgb',
      bounds: [7.7, 49.38, 10.25, 51.66],
      attribution: 'Luftbild Hessen © HVBG (dl-de/by-2-0)',
    },
    {
      id: 'dop-nw',
      url: 'https://www.wms.nrw.de/geobasis/wms_nw_dop',
      layer: 'nw_dop_rgb',
      bounds: [5.86, 50.32, 9.46, 52.53],
      attribution: 'Luftbild NRW © Geobasis NRW (dl-de/zero-2-0)',
    },
    {
      id: 'dop-rp',
      url: 'https://geo4.service24.rlp.de/wms/rp_dop20.fcgi',
      layer: 'rp_dop20',
      bounds: [6.11, 48.96, 8.51, 50.95],
      attribution: 'Luftbild RLP © GeoBasis-DE/LVermGeoRP (dl-de/by-2-0)',
    },
  ];

const AERIAL: StyleSpecification = {
  version: 8,
  sources: {
    ...SATELLITE.sources,
    ...Object.fromEntries(
      DOP.map((d) => [
        d.id,
        {
          type: 'raster' as const,
          tiles: [`${d.url}?${WMS_PARAMS}&LAYERS=${d.layer}`],
          tileSize: 512,
          minzoom: 11,
          maxzoom: 20,
          bounds: d.bounds,
          attribution: d.attribution,
        },
      ]),
    ),
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery' },
    ...DOP.map((d) => ({ id: d.id, type: 'raster' as const, source: d.id, minzoom: 11 })),
    { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } },
  ],
};

const STYLES: Record<Basemap, string | StyleSpecification> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  standard: 'https://tiles.openfreemap.org/styles/liberty',
  satellite: SATELLITE,
  aerial: AERIAL,
};

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };

/** Klick näher als so viele Pixel an der Route zählt als Klick auf die Route. */
const HIT_PX = 14;

interface RouteMenu {
  x: number;
  y: number;
  distance: number;
  point: LngLat;
}

export interface MapApi {
  fly: (center: LngLat, zoom?: number) => void;
  fit: (coords: LngLat[], maxZoom?: number) => void;
}

interface Props {
  route: CombinedRoute | null;
  stale: boolean;
  pieces: Piece[];
  /** Abschnitte mit unsicherem Belag (gepunktet über der Route) */
  uncertain: LngLat[][];
  onMapApi?: (api: MapApi) => void;
}

function suggestionFeatures(list: Suggestion[], active: string | null): FC {
  const features = list.map((s, i) => ({
    type: 'Feature' as const,
    properties: { id: s.id, color: SUGGESTION_COLORS[i % SUGGESTION_COLORS.length], active: s.id === active ? 1 : 0 },
    geometry: { type: 'LineString' as const, coordinates: s.leg.coords },
  }));
  // aktiven Vorschlag zuletzt zeichnen (liegt oben)
  features.sort((a, b) => a.properties.active - b.properties.active);
  return { type: 'FeatureCollection', features };
}

function routeFeatures(route: CombinedRoute | null, pieces: Piece[]): FC {
  if (!route) return EMPTY;
  return {
    type: 'FeatureCollection',
    features: pieces.map((s) => ({
      type: 'Feature',
      properties: { color: s.color },
      geometry: { type: 'LineString', coordinates: route.coords.slice(s.from, s.to + 1) },
    })),
  };
}

function lineFC(lines: LngLat[][]): FC {
  return {
    type: 'FeatureCollection',
    features: lines
      .filter((l) => l.length > 1)
      .map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
  };
}

function pointFC(points: LngLat[]): FC {
  return {
    type: 'FeatureCollection',
    features: points.map((coordinates) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates },
    })),
  };
}

function addLayers(map: MlMap) {
  if (map.getLayer('route')) return;
  const src = (id: string) => {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY });
  };
  ['route', 'selection', 'blocks', 'avoids', 'overrides', 'hover', 'sel-ends', 'sugg', 'import', 'uncertain'].forEach(
    src,
  );

  map.addLayer({
    id: 'import',
    type: 'line',
    source: 'import',
    paint: { 'line-color': '#a21caf', 'line-width': 2.5, 'line-dasharray': [2, 1.5], 'line-opacity': 0.85 },
  });

  map.addLayer({
    id: 'blocks',
    type: 'line',
    source: 'blocks',
    paint: { 'line-color': '#dc2626', 'line-width': 5, 'line-dasharray': [1, 1], 'line-opacity': 0.8 },
    layout: { 'line-cap': 'round' },
  });
  map.addLayer({
    id: 'avoids',
    type: 'line',
    source: 'avoids',
    paint: { 'line-color': '#f97316', 'line-width': 4, 'line-dasharray': [1, 1.5], 'line-opacity': 0.8 },
  });
  map.addLayer({
    id: 'selection',
    type: 'line',
    source: 'selection',
    paint: { 'line-color': '#0f172a', 'line-width': 18, 'line-opacity': 0.4 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route',
    paint: { 'line-color': '#ffffff', 'line-width': 8 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  map.addLayer({
    id: 'route',
    type: 'line',
    source: 'route',
    paint: { 'line-color': ['get', 'color'], 'line-width': 5 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  map.addLayer({
    id: 'uncertain',
    type: 'line',
    source: 'uncertain',
    paint: { 'line-color': '#ffffff', 'line-width': 3.5, 'line-dasharray': [0.1, 1.8], 'line-opacity': 0.95 },
    layout: { 'line-cap': 'round' },
  });
  map.addLayer({
    id: 'overrides',
    type: 'line',
    source: 'overrides',
    paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 2] },
  });
  map.addLayer({
    id: 'sugg-casing',
    type: 'line',
    source: 'sugg',
    paint: {
      'line-color': '#ffffff',
      'line-width': ['case', ['==', ['get', 'active'], 1], 10, 6],
      'line-opacity': 0.9,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  map.addLayer({
    id: 'sugg',
    type: 'line',
    source: 'sugg',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['==', ['get', 'active'], 1], 6, 3.5],
      'line-opacity': ['case', ['==', ['get', 'active'], 1], 1, 0.55],
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  map.addLayer({
    id: 'sel-ends',
    type: 'circle',
    source: 'sel-ends',
    paint: { 'circle-radius': 6, 'circle-color': '#0f172a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
  });
  map.addLayer({
    id: 'hover',
    type: 'circle',
    source: 'hover',
    paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': '#0f172a', 'circle-stroke-width': 2.5 },
  });
}

function setData(map: MlMap, id: string, data: FC) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

export function MapView({ route, stale, pieces, uncertain, onMapApi }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [styleReady, setStyleReady] = useState(0);
  const [menu, setMenu] = useState<RouteMenu | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const markerOwner = useRef<MlMap | null>(null);

  const waypoints = useStore((s) => s.waypoints);
  const basemap = useStore((s) => s.basemap);
  const blocks = useStore((s) => s.blocks);
  const overrides = useStore((s) => s.overrides);
  const selection = useStore((s) => s.selection);
  const hoverDistance = useStore((s) => s.hoverDistance);
  const mode = useStore((s) => s.mode);
  const loopStart = useStore((s) => s.loopStart);
  const suggestions = useStore((s) => s.suggestions);
  const activeSuggestion = useStore((s) => s.activeSuggestion);
  const startMarker = useRef<Marker | null>(null);
  const hideRoute = useStore((s) => s.hideRoute);

  // aktuelle Werte für Event-Handler
  const routeRef = useRef(route);
  routeRef.current = route;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  // Karte anlegen
  useEffect(() => {
    const { view, basemap } = useStore.getState();
    const map = new MlMap({
      container: container.current!,
      style: STYLES[basemap],
      center: view.center,
      zoom: view.zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('style.load', () => {
      addLayers(map);
      setStyleReady((n) => n + 1);
    });
    map.on('moveend', () => {
      const c = map.getCenter();
      useStore.getState().setView({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });
    map.on('movestart', () => setMenu(null));

    const hitSuggestion = (e: MapMouseEvent): string | null => {
      if (!map.getLayer('sugg')) return null;
      const p = e.point;
      const f = map.queryRenderedFeatures(
        [
          [p.x - 8, p.y - 8],
          [p.x + 8, p.y + 8],
        ],
        { layers: ['sugg'] },
      );
      // aktiven bzw. obersten Treffer bevorzugen
      return (f[f.length - 1]?.properties?.id as string | undefined) ?? null;
    };

    const hitRoute = (e: MapMouseEvent) => {
      if (useStore.getState().mode !== 'route') return null;
      const r = routeRef.current;
      if (!r) return null;
      const proj = projectOnLine([e.lngLat.lng, e.lngLat.lat], r.coords, r.dist);
      if (!proj) return null;
      const px = map.project(proj.point);
      const d = Math.hypot(px.x - e.point.x, px.y - e.point.y);
      return d <= HIT_PX ? proj : null;
    };

    map.on('mousemove', (e) => {
      if (useStore.getState().mode === 'explore') return;
      if (useStore.getState().mode === 'loop') {
        map.getCanvas().style.cursor = hitSuggestion(e) ? 'pointer' : '';
        return;
      }
      const hit = hitRoute(e);
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
      const st = useStore.getState();
      st.setHoverDistance(hit ? hit.distance : null);
    });

    map.on('click', (e) => {
      const st = useStore.getState();
      if (st.mode === 'explore') {
        if (st.activePoi) st.setActivePoi(null);
        else st.setLoopStart([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      if (st.mode === 'loop') {
        const id = hitSuggestion(e);
        if (id) st.setActiveSuggestion(id);
        else st.setLoopStart([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      const hit = hitRoute(e);
      const sel = selectionRef.current;
      // Auswahl läuft: zweiter Klick auf die Route setzt das Ende
      if (sel && sel.end === null) {
        if (hit) {
          const [a, b] = [sel.start, hit.distance].sort((x, y) => x - y);
          st.setSelection({ start: a, end: Math.max(b, a + 20) });
        } else {
          st.setSelection(null);
        }
        return;
      }
      if (hit) {
        setMenu({ x: e.point.x, y: e.point.y, distance: hit.distance, point: hit.point });
        return;
      }
      setMenu(null);
      if (sel) {
        st.setSelection(null);
        return;
      }
      st.addWaypoint([e.lngLat.lng, e.lngLat.lat]);
    });

    onMapApi?.({
      fly: (center, zoom = 13) => map.flyTo({ center, zoom }),
      fit: (coords, maxZoom = 14) => {
        if (!coords.length) return;
        const b = new LngLatBounds();
        coords.forEach((c) => b.extend(c));
        const sidebarRight = window.innerWidth > 760 ? 40 : 20;
        map.fitBounds(b, { padding: { top: 90, bottom: 170, left: sidebarRight, right: 60 }, maxZoom });
      },
    });
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kartenstil wechseln
  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) {
      firstStyle.current = false;
      return;
    }
    mapRef.current?.setStyle(STYLES[basemap]);
  }, [basemap]);

  // Route & Overlays
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    setData(map, 'route', routeFeatures(route, pieces));
    const dim = hideRoute ? 0 : mode !== 'route' ? 0.2 : stale ? 0.45 : 1;
    map.setPaintProperty('route', 'line-opacity', dim);
    map.setPaintProperty('route-casing', 'line-opacity', hideRoute ? 0 : mode !== 'route' ? 0.2 : 1);
    map.setPaintProperty('overrides', 'line-opacity', hideRoute ? 0 : 1);
    map.setPaintProperty('uncertain', 'line-opacity', hideRoute || mode !== 'route' ? 0 : 0.95);
    // ausgeblendet: nur die Endpunkte der Auswahl zeigen, damit die Straße sichtbar bleibt
    map.setPaintProperty('selection', 'line-opacity', hideRoute ? 0 : 0.4);
    map.setPaintProperty('import', 'line-opacity', hideRoute ? 0 : 0.85);
    // Im Luftbild schmaler zeichnen, damit die Straße daneben sichtbar bleibt
    const sat = basemap === 'satellite' || basemap === 'aerial';
    map.setPaintProperty('route', 'line-width', sat ? ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 3] : 5);
    map.setPaintProperty('uncertain', 'line-width', sat ? ['interpolate', ['linear'], ['zoom'], 12, 3, 17, 2.5] : 3.5);
    map.setPaintProperty(
      'route-casing',
      'line-width',
      sat ? ['interpolate', ['linear'], ['zoom'], 12, 6.5, 17, 4.5] : 8,
    );
  }, [route, pieces, stale, styleReady, mode, hideRoute, basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    setData(map, 'uncertain', lineFC(uncertain));
  }, [uncertain, styleReady]);

  // Rundtour-Vorschläge
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    setData(map, 'sugg', mode === 'loop' ? suggestionFeatures(suggestions, activeSuggestion) : EMPTY);
  }, [suggestions, activeSuggestion, mode, styleReady]);

  // Startpunkt für Rundtouren
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (startMarker.current && (startMarker.current as unknown as { _map?: MlMap })._map !== map) {
      startMarker.current.remove();
      startMarker.current = null;
    }
    if (mode === 'route' || !loopStart) {
      startMarker.current?.remove();
      startMarker.current = null;
      return;
    }
    if (!startMarker.current) {
      const el = document.createElement('div');
      const inner = document.createElement('div');
      inner.className = 'wp wp-loopstart';
      inner.textContent = 'S';
      inner.title = 'Startpunkt – ziehen zum Verschieben';
      el.appendChild(inner);
      el.addEventListener('click', (ev) => ev.stopPropagation());
      const m = new Marker({ element: el, draggable: true }).setLngLat(loopStart).addTo(map);
      m.on('dragend', () => {
        const p = m.getLngLat();
        useStore.getState().setLoopStart([p.lng, p.lat]);
      });
      startMarker.current = m;
    }
    startMarker.current.setLngLat(loopStart);
  }, [mode, loopStart, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    setData(map, 'blocks', lineFC(blocks.map((b) => b.line)));
    setData(
      map,
      'avoids',
      mode === 'loop' ? EMPTY : lineFC(Object.values(overrides).flatMap((o) => (o.avoid ?? []).map((a) => a.line))),
    );
    const overridden = route
      ? route.legRanges
          .filter(
            (l) =>
              (overrides[l.key]?.settings && overrides[l.key]?.presetLabel !== 'Import') ||
              overrides[l.key]?.alternative,
          )
          .map((l) => route.coords.slice(l.from, l.to + 1))
      : [];
    setData(map, 'overrides', lineFC(mode === 'loop' ? [] : overridden));
  }, [blocks, overrides, route, styleReady, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (!route || !selection) {
      setData(map, 'selection', EMPTY);
      setData(map, 'sel-ends', EMPTY);
      return;
    }
    const end = selection.end ?? hoverDistance;
    const ends: LngLat[] = [pointAtDistance(route.coords, route.dist, selection.start)];
    if (end !== null) {
      const [a, b] = [selection.start, end].sort((x, y) => x - y);
      setData(map, 'selection', lineFC([sliceLine(route.coords, route.dist, a, b)]));
      ends.push(pointAtDistance(route.coords, route.dist, end));
    } else {
      setData(map, 'selection', EMPTY);
    }
    setData(map, 'sel-ends', pointFC(ends));
  }, [route, selection, hoverDistance, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    setData(
      map,
      'hover',
      route && hoverDistance !== null ? pointFC([pointAtDistance(route.coords, route.dist, hoverDistance)]) : EMPTY,
    );
  }, [route, hoverDistance, styleReady]);

  // Wegpunkt-Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Marker gehören evtl. noch zu einer verworfenen Karteninstanz (StrictMode/HMR)
    if (markerOwner.current !== map) {
      markers.current.forEach((m) => m.remove());
      markers.current.clear();
      markerOwner.current = map;
    }
    const seen = new Set<string>();
    const isLoop =
      waypoints.length > 2 &&
      haversine(
        [waypoints[0].lng, waypoints[0].lat],
        [waypoints[waypoints.length - 1].lng, waypoints[waypoints.length - 1].lat],
      ) < 50;
    waypoints.forEach((wp, i) => {
      seen.add(wp.id);
      const kind = i === 0 ? 'start' : i === waypoints.length - 1 ? (isLoop ? 'loop' : 'end') : 'via';
      const label = kind === 'start' ? 'A' : kind === 'end' ? 'B' : kind === 'loop' ? '↺' : String(i);
      let m = markers.current.get(wp.id);
      if (!m) {
        // äußeres Element gehört MapLibre (Positionierungsklassen), Inhalt liegt im Kind
        const el = document.createElement('div');
        el.appendChild(document.createElement('div'));
        el.addEventListener('click', (ev) => ev.stopPropagation());
        el.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          useStore.getState().removeWaypoint(wp.id);
        });
        el.addEventListener('dblclick', (ev) => {
          ev.stopPropagation();
          useStore.getState().removeWaypoint(wp.id);
        });
        m = new Marker({ element: el, draggable: true }).setLngLat([wp.lng, wp.lat]).addTo(map);
        m.on('dragend', () => {
          const p = m!.getLngLat();
          useStore.getState().moveWaypoint(wp.id, [p.lng, p.lat]);
        });
        markers.current.set(wp.id, m);
      }
      m.getElement().style.display = mode !== 'route' ? 'none' : '';
      const el = m.getElement().firstElementChild as HTMLElement;
      el.className = `wp wp-${kind}`;
      el.textContent = label;
      el.title = 'Ziehen zum Verschieben · Doppelklick oder Rechtsklick zum Entfernen';
      m.setLngLat([wp.lng, wp.lat]);
    });
    for (const [id, m] of markers.current) {
      if (!seen.has(id)) {
        m.remove();
        markers.current.delete(id);
      }
    }
  }, [waypoints, styleReady, mode]);

  // Original-Track eines GPX-Imports
  const importTrack = useStore((s) => s.importTrack);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    setData(map, 'import', importTrack && mode === 'route' ? lineFC([importTrack.coords]) : EMPTY);
  }, [importTrack, styleReady, mode]);

  // POI-Marker: Stopps entlang der Route bzw. Ziele im Entdecken-Modus
  const stops = useStore((s) => s.stops);
  const destinations = useStore((s) => s.destinations);
  const activePoi = useStore((s) => s.activePoi);
  const poiMarkers = useRef(new Map<string, Marker>());
  const poiOwner = useRef<MlMap | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (poiOwner.current !== map) {
      poiMarkers.current.forEach((m) => m.remove());
      poiMarkers.current.clear();
      poiOwner.current = map;
    }
    const list = mode === 'route' ? stops : mode === 'explore' ? destinations : [];
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.id);
      let m = poiMarkers.current.get(p.id);
      if (!m) {
        const el = document.createElement('div');
        const inner = document.createElement('div');
        inner.className = 'poi';
        inner.textContent = p.icon;
        inner.title = p.name;
        el.appendChild(inner);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setMenu(null);
          useStore.getState().setActivePoi(p.id);
        });
        m = new Marker({ element: el }).setLngLat(p.coord).addTo(map);
        poiMarkers.current.set(p.id, m);
      }
      const on = p.id === activePoi;
      (m.getElement().firstElementChild as HTMLElement).classList.toggle('on', on);
      m.getElement().style.zIndex = on ? '3' : '1';
    }
    for (const [id, m] of poiMarkers.current) {
      if (!seen.has(id)) {
        m.remove();
        poiMarkers.current.delete(id);
      }
    }
  }, [stops, destinations, mode, activePoi, styleReady]);

  // Auf Route zoomen, wenn sie aus dem Speicher geladen wurde
  const fitted = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || fitted.current) return;
    fitted.current = true;
    const b = new LngLatBounds();
    route.coords.forEach((c) => b.extend(c));
    const bounds = map.getBounds();
    if (!bounds.contains(b.getNorthEast()) || !bounds.contains(b.getSouthWest())) {
      map.fitBounds(b, { padding: 80, duration: 0 });
    }
  }, [route]);

  const startSelection = () => {
    if (!menu) return;
    useStore.getState().setSelection({ start: menu.distance, end: null });
    setMenu(null);
  };

  const satelliteHere = () => {
    if (!menu) return;
    const b = useStore.getState().basemap;
    if (b !== 'satellite' && b !== 'aerial') useStore.getState().setBasemap('aerial');
    mapRef.current?.flyTo({ center: menu.point, zoom: 18 });
    setMenu(null);
  };

  /** Externe Ansicht an der angeklickten Stelle öffnen. */
  const openExternal = (kind: 'streetview' | 'mapillary' | 'komoot') => {
    if (!menu) return;
    const [lng, lat] = menu.point;
    const ll = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    let url: string;
    if (kind === 'streetview') {
      // Blickrichtung = Fahrtrichtung der Route an dieser Stelle
      let heading = '';
      if (route) {
        const a = pointAtDistance(route.coords, route.dist, menu.distance - 15);
        const b = pointAtDistance(route.coords, route.dist, menu.distance + 15);
        heading = `&heading=${Math.round(bearing(a, b))}`;
      }
      url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}${heading}`;
    } else if (kind === 'mapillary') {
      url = `https://www.mapillary.com/app/?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}&z=17`;
    } else {
      url = `https://www.komoot.com/de-de/plan/@${ll},15z`;
    }
    window.open(url, '_blank', 'noopener');
    setMenu(null);
  };

  const insertHere = () => {
    if (!menu || !route) return;
    const leg = route.legRanges.findIndex((l) => {
      return route.dist[l.from] <= menu.distance && route.dist[l.to] >= menu.distance;
    });
    useStore.getState().insertWaypoint(Math.max(leg, 0) + 1, menu.point);
    setMenu(null);
  };

  return (
    <div className="map-wrap">
      <div ref={container} className="map" />
      {menu && (
        <div
          className="route-menu"
          style={{
            left: menu.x,
            top: menu.y,
            // am rechten Rand nach links aufklappen
            transform:
              menu.x > (container.current?.clientWidth ?? 0) - 260 ? 'translate(calc(-100% - 8px), 8px)' : undefined,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={startSelection}>
            <span className="ico">⟷</span> Abschnitt ab hier markieren
          </button>
          <button onClick={insertHere}>
            <span className="ico">＋</span> Wegpunkt einfügen
          </button>
          <hr />
          {(basemap !== 'satellite' && basemap !== 'aerial') || (mapRef.current?.getZoom() ?? 0) < 16 ? (
            <button onClick={satelliteHere}>
              <span className="ico">◩</span> Im Luftbild ansehen
            </button>
          ) : null}
          <button onClick={() => openExternal('streetview')}>
            <span className="ico">◉</span> Google Street View
          </button>
          <button onClick={() => openExternal('mapillary')}>
            <span className="ico">◎</span> Straßenfotos (Mapillary)
          </button>
          <button onClick={() => openExternal('komoot')}>
            <span className="ico">◆</span> In Komoot öffnen (Highlights)
          </button>
        </div>
      )}
      {mode !== 'route' && !loopStart && (
        <div className="map-hint">Klicke auf die Karte, um den Startpunkt zu setzen</div>
      )}
      {mode === 'route' && selection && selection.end === null && (
        <div className="map-hint">Klicke auf das Ende des Abschnitts · Esc bricht ab</div>
      )}
      {mode === 'route' && !waypoints.length && (
        <div className="map-hint">Klicke auf die Karte, um den Start zu setzen</div>
      )}
      {mode === 'route' && waypoints.length === 1 && (
        <div className="map-hint">Jetzt das Ziel oder einen Zwischenpunkt setzen</div>
      )}
    </div>
  );
}
