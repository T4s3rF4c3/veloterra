import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LngLat } from './domain/geo';
import { legKey, type Block, type LegOverride, type LegResult, type Waypoint } from './domain/route';
import type { Photo } from './api/photos';
import type { NetworkGroup, NetworkKind, NetRoute } from './api/waymarked';
import type { DestinationSort, Poi } from './domain/poi';
import type { Direction, Ranking } from './domain/roundtrip';
import { DEFAULT_SETTINGS, cloneSettings, type RoutingSettings } from './domain/settings';

export type ColorMode = 'surface' | 'road' | 'grade' | 'wind' | 'novelty' | 'plain';
export type Basemap = 'light' | 'standard' | 'satellite' | 'aerial';

/** Auswahl eines Routenabschnitts in Metern ab Start. */
export interface Selection {
  start: number;
  end: number | null;
}

export type Mode = 'route' | 'loop' | 'explore' | 'network';

/** Bereich der Seitenleiste */
export type Area = 'plan' | 'discover' | 'mine' | 'profile';

export interface LoopOptions {
  distance: number;
  direction: Direction;
  ranking: Ranking;
}

export interface Suggestion {
  id: string;
  leg: LegResult;
  direction: number;
}

export interface SavedRoute {
  id: string;
  name: string;
  savedAt: number;
  waypoints: Waypoint[];
  overrides: Record<string, LegOverride>;
  settings: RoutingSettings;
  presetId: string | null;
  length: number;
  ascend: number;
}

export interface ExploreOptions {
  /** Umkreis um den Start (Luftlinie, Meter) */
  distance: number;
  categories: string[];
  sort: DestinationSort;
}

let counter = 0;
export const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

interface State {
  waypoints: Waypoint[];
  settings: RoutingSettings;
  presetId: string | null;
  overrides: Record<string, LegOverride>;
  blocks: Block[];
  colorMode: ColorMode;
  basemap: Basemap;
  /** Route kurz ausblenden, um die Straße darunter zu sehen */
  hideRoute: boolean;
  view: { center: LngLat; zoom: number };
  mode: Mode;
  area: Area;
  /** zuletzt genutzter Entdecken-Modus */
  discoverMode: Exclude<Mode, 'route'>;
  loopStart: LngLat | null;
  loopOptions: LoopOptions;
  exploreOptions: ExploreOptions;
  /** Stopps (Café, Wasser …) entlang der Route anzeigen */
  showStops: boolean;
  /** Netz beschilderter Radrouten als Kartenebene */
  netOverlay: 'off' | NetworkKind;
  /** öffentliche GPS-Spuren von OpenStreetMap als Kartenebene */
  showGpsTraces: boolean;
  /** GPS-Spuren als Linien (Kacheln) oder als Dichte-Heatmap */
  gpsMode: 'lines' | 'density';
  /** Dichte: alle Rad-Spuren oder nur Rennrad-Tempo ('all' aus älteren Versionen = Rad) */
  gpsFilter: 'all' | 'bike' | 'fast';
  /** nur Wege zeigen, die mehrere Spuren berühren */
  gpsMulti: boolean;
  /** eigene Heatmap (importierte Fahrten) anzeigen */
  showMyHeat: boolean;
  /** Radwege-Modus: Rad- oder MTB-Routen, welche Ebenen */
  networkKind: NetworkKind;
  networkGroups: NetworkGroup[];
  stopCategories: string[];
  showPhotos: boolean;
  mapillaryToken: string;
  library: SavedRoute[];
  /** Name der aktuellen Route und ggf. ID in der Bibliothek */
  routeName: string;
  savedId: string | null;
  /** Abschnitte mit unsicherem Belag, die als „passt“ bestätigt wurden */
  checkedSurfaces: string[];

  // flüchtiger Zustand
  /** Abfahrtszeit für die Windvorhersage (null = jetzt) */
  departure: number | null;
  /** Original-Track eines GPX-Imports zum Vergleich */
  importTrack: { name: string; coords: LngLat[] } | null;
  stops: Poi[];
  destinations: Poi[];
  activePoi: string | null;
  photos: Photo[];
  activePhoto: string | null;
  /** gerade geprüfter unsicherer Abschnitt */
  activeCheck: string | null;
  networkRoutes: NetRoute[];
  /** gewählte bzw. hervorgehobene Radroute und ihr Verlauf */
  activeNetwork: number | null;
  networkLines: LngLat[][];
  suggestions: Suggestion[];
  /** hervorgehobener Vorschlag (Hover/Auswahl) */
  activeSuggestion: string | null;
  selection: Selection | null;
  hoverDistance: number | null;
  /** Etappe, deren Sonder-Einstellungen gerade bearbeitet werden */
  editingLeg: string | null;

  addWaypoint: (p: LngLat) => void;
  insertWaypoint: (index: number, p: LngLat) => string;
  moveWaypoint: (id: string, p: LngLat) => void;
  removeWaypoint: (id: string) => void;
  reverse: () => void;
  closeLoop: () => void;
  clearRoute: () => void;

  setSettings: (s: RoutingSettings, presetId?: string | null) => void;
  setOverride: (key: string, o: LegOverride | null) => void;
  addBlock: (b: Omit<Block, 'id'>) => void;
  removeBlock: (id: string) => void;

  setColorMode: (m: ColorMode) => void;
  setBasemap: (b: Basemap) => void;
  setHideRoute: (h: boolean) => void;
  setView: (v: State['view']) => void;
  setSelection: (s: Selection | null) => void;
  setHoverDistance: (d: number | null) => void;
  setEditingLeg: (k: string | null) => void;
  setMode: (m: Mode) => void;
  /** Bereich wechseln; Planen/Entdecken schalten auch den Kartenmodus */
  setArea: (a: Area) => void;
  setLoopStart: (p: LngLat | null) => void;
  setLoopOptions: (o: Partial<LoopOptions>) => void;
  setSuggestions: (s: Suggestion[]) => void;
  setActiveSuggestion: (id: string | null) => void;
  /** Route komplett ersetzen (z. B. durch übernommene Rundtour) */
  replaceRoute: (wps: Waypoint[], overrides?: Record<string, LegOverride>, name?: string) => void;
  setExploreOptions: (o: Partial<ExploreOptions>) => void;
  setShowStops: (v: boolean) => void;
  setStopCategories: (c: string[]) => void;
  setShowPhotos: (v: boolean) => void;
  setMapillaryToken: (t: string) => void;
  setDeparture: (t: number | null) => void;
  setImportTrack: (t: State['importTrack']) => void;
  setStops: (p: Poi[]) => void;
  setDestinations: (p: Poi[]) => void;
  setActivePoi: (id: string | null) => void;
  setPhotos: (p: Photo[]) => void;
  setActivePhoto: (id: string | null) => void;
  setRouteName: (n: string) => void;
  markSurfaceOk: (id: string) => void;
  setNetOverlay: (o: State['netOverlay']) => void;
  setShowGpsTraces: (v: boolean) => void;
  setGpsMode: (m: State['gpsMode']) => void;
  setGpsFilter: (f: State['gpsFilter']) => void;
  setGpsMulti: (v: boolean) => void;
  setShowMyHeat: (v: boolean) => void;
  setNetworkKind: (k: NetworkKind) => void;
  setNetworkGroups: (g: NetworkGroup[]) => void;
  setNetworkRoutes: (r: NetRoute[]) => void;
  setActiveNetwork: (id: number | null, lines?: LngLat[][]) => void;
  resetCheckedSurfaces: () => void;
  setActiveCheck: (id: string | null) => void;
  /** aktuelle Route in der Bibliothek speichern (überschreibt, wenn schon gespeichert) */
  saveRoute: (stats: { length: number; ascend: number }, asNew?: boolean) => void;
  loadRoute: (id: string) => void;
  deleteRoute: (id: string) => void;
  renameRoute: (id: string, name: string) => void;
}

/** Überschreibungen von Etappen entfernen, die es nicht mehr gibt. */
function pruneOverrides(wps: Waypoint[], overrides: Record<string, LegOverride>) {
  const keys = new Set<string>();
  for (let i = 0; i < wps.length - 1; i++) keys.add(legKey(wps[i], wps[i + 1]));
  return Object.fromEntries(Object.entries(overrides).filter(([k]) => keys.has(k)));
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      waypoints: [],
      settings: cloneSettings(DEFAULT_SETTINGS),
      presetId: 'road',
      overrides: {},
      blocks: [],
      colorMode: 'surface',
      // Start immer mit amtlichem Luftbild (wird bewusst nicht gespeichert)
      basemap: 'aerial',
      hideRoute: false,
      view: { center: [8.68, 50.11], zoom: 11 },
      mode: 'route',
      area: 'plan',
      discoverMode: 'loop',
      loopStart: null,
      loopOptions: { distance: 60000, direction: 'any', ranking: 'quality' },
      exploreOptions: {
        distance: 25000,
        categories: ['view', 'peak', 'castle', 'lake', 'cafe', 'bike'],
        sort: 'interest',
      },
      showStops: false,
      netOverlay: 'off',
      showGpsTraces: false,
      gpsMode: 'density',
      gpsFilter: 'bike',
      gpsMulti: false,
      showMyHeat: true,
      networkKind: 'cycling',
      networkGroups: ['INT', 'NAT', 'REG', 'LOC'],
      networkRoutes: [],
      activeNetwork: null,
      networkLines: [],
      stopCategories: ['cafe', 'water', 'bike'],
      showPhotos: false,
      mapillaryToken: '',
      library: [],
      routeName: '',
      savedId: null,
      checkedSurfaces: [],
      activeCheck: null,
      departure: null,
      importTrack: null,
      stops: [],
      destinations: [],
      activePoi: null,
      photos: [],
      activePhoto: null,
      selection: null,
      hoverDistance: null,
      editingLeg: null,
      suggestions: [],
      activeSuggestion: null,

      addWaypoint: (p) =>
        set((s) => ({ waypoints: [...s.waypoints, { id: uid(), lng: p[0], lat: p[1] }], selection: null })),

      insertWaypoint: (index, p) => {
        const id = uid();
        set((s) => {
          const wps = [...s.waypoints];
          // Sonder-Einstellung der geteilten Etappe auf beide Hälften übertragen
          const prev = wps[index - 1];
          const next = wps[index];
          const wp = { id, lng: p[0], lat: p[1] };
          const overrides = { ...s.overrides };
          if (prev && next) {
            const old = overrides[legKey(prev, next)];
            if (old) {
              overrides[legKey(prev, wp)] = old;
              overrides[legKey(wp, next)] = old;
            }
          }
          wps.splice(index, 0, wp);
          return { waypoints: wps, overrides: pruneOverrides(wps, overrides) };
        });
        return id;
      },

      moveWaypoint: (id, p) =>
        set((s) => ({ waypoints: s.waypoints.map((w) => (w.id === id ? { ...w, lng: p[0], lat: p[1] } : w)) })),

      removeWaypoint: (id) =>
        set((s) => {
          const wps = s.waypoints.filter((w) => w.id !== id);
          return { waypoints: wps, overrides: pruneOverrides(wps, s.overrides), selection: null };
        }),

      reverse: () => set((s) => ({ waypoints: [...s.waypoints].reverse(), overrides: {}, selection: null })),

      closeLoop: () => {
        const wps = get().waypoints;
        if (wps.length < 2) return;
        get().addWaypoint([wps[0].lng, wps[0].lat]);
      },

      clearRoute: () =>
        set({
          waypoints: [],
          overrides: {},
          selection: null,
          editingLeg: null,
          routeName: '',
          savedId: null,
          importTrack: null,
        }),

      setSettings: (settings, presetId = null) => set({ settings, presetId }),
      setOverride: (key, o) =>
        set((s) => {
          const overrides = { ...s.overrides };
          if (o) overrides[key] = o;
          else delete overrides[key];
          return { overrides };
        }),
      addBlock: (b) => set((s) => ({ blocks: [...s.blocks, { ...b, id: uid() }] })),
      removeBlock: (id) => set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) })),

      setColorMode: (colorMode) => set({ colorMode }),
      setBasemap: (basemap) => set({ basemap }),
      setHideRoute: (hideRoute) => set({ hideRoute }),
      setView: (view) => set({ view }),
      setSelection: (selection) => set({ selection }),
      setHoverDistance: (hoverDistance) => set({ hoverDistance }),
      setEditingLeg: (editingLeg) => set({ editingLeg }),
      setArea: (area) =>
        set((s) => {
          if (area === 'plan') return { area, mode: 'route', selection: null, editingLeg: null, activePoi: null };
          if (area === 'discover') {
            const mode = s.discoverMode;
            return {
              area,
              mode,
              selection: null,
              editingLeg: null,
              activePoi: null,
              loopStart: !s.loopStart && s.waypoints[0] ? [s.waypoints[0].lng, s.waypoints[0].lat] : s.loopStart,
            };
          }
          return { area };
        }),
      setMode: (mode) =>
        set((s) => ({
          mode,
          area: mode === 'route' ? 'plan' : 'discover',
          discoverMode: mode === 'route' ? s.discoverMode : mode,
          selection: null,
          editingLeg: null,
          activePoi: null,
          loopStart:
            mode !== 'route' && !s.loopStart && s.waypoints[0] ? [s.waypoints[0].lng, s.waypoints[0].lat] : s.loopStart,
        })),
      setLoopStart: (loopStart) => set({ loopStart, suggestions: [], activeSuggestion: null, destinations: [] }),
      setLoopOptions: (o) => set((s) => ({ loopOptions: { ...s.loopOptions, ...o } })),
      setSuggestions: (suggestions) => set({ suggestions }),
      setActiveSuggestion: (activeSuggestion) => set({ activeSuggestion }),
      replaceRoute: (waypoints, overrides = {}, name = '') =>
        set({
          waypoints,
          overrides,
          selection: null,
          editingLeg: null,
          mode: 'route',
          area: 'plan',
          suggestions: [],
          activeSuggestion: null,
          activePoi: null,
          routeName: name,
          savedId: null,
          importTrack: null,
        }),
      setExploreOptions: (o) => set((s) => ({ exploreOptions: { ...s.exploreOptions, ...o } })),
      setShowStops: (showStops) => set({ showStops }),
      setStopCategories: (stopCategories) => set({ stopCategories }),
      setShowPhotos: (showPhotos) => set({ showPhotos }),
      setMapillaryToken: (mapillaryToken) => set({ mapillaryToken: mapillaryToken.trim() }),
      setDeparture: (departure) => set({ departure }),
      setImportTrack: (importTrack) => set({ importTrack }),
      setStops: (stops) => set({ stops }),
      setDestinations: (destinations) => set({ destinations }),
      setActivePoi: (activePoi) => set({ activePoi }),
      setPhotos: (photos) => set({ photos }),
      setActivePhoto: (activePhoto) => set({ activePhoto }),
      setRouteName: (routeName) => set({ routeName }),
      markSurfaceOk: (id) =>
        set((s) => ({ checkedSurfaces: [...s.checkedSurfaces.filter((x) => x !== id), id].slice(-500) })),
      resetCheckedSurfaces: () => set({ checkedSurfaces: [] }),
      setNetOverlay: (netOverlay) => set({ netOverlay }),
      setShowGpsTraces: (showGpsTraces) => set({ showGpsTraces }),
      setGpsMode: (gpsMode) => set({ gpsMode }),
      setGpsFilter: (gpsFilter) => set({ gpsFilter }),
      setGpsMulti: (gpsMulti) => set({ gpsMulti }),
      setShowMyHeat: (showMyHeat) => set({ showMyHeat }),
      setNetworkKind: (networkKind) => set({ networkKind, networkRoutes: [], activeNetwork: null, networkLines: [] }),
      setNetworkGroups: (networkGroups) => set({ networkGroups }),
      setNetworkRoutes: (networkRoutes) => set({ networkRoutes }),
      setActiveNetwork: (activeNetwork, networkLines = []) => set({ activeNetwork, networkLines }),
      setActiveCheck: (activeCheck) => set({ activeCheck }),
      saveRoute: (stats, asNew = false) =>
        set((s) => {
          const id = !asNew && s.savedId && s.library.some((r) => r.id === s.savedId) ? s.savedId : uid();
          const name = s.routeName.trim() || `Route ${new Date().toLocaleDateString('de-DE')}`;
          const entry: SavedRoute = {
            id,
            name,
            savedAt: Date.now(),
            waypoints: s.waypoints,
            overrides: s.overrides,
            settings: s.settings,
            presetId: s.presetId,
            length: stats.length,
            ascend: stats.ascend,
          };
          const library = [entry, ...s.library.filter((r) => r.id !== id)];
          return { library, savedId: id, routeName: name };
        }),
      loadRoute: (id) => {
        const r = get().library.find((x) => x.id === id);
        if (!r) return;
        set({
          waypoints: r.waypoints,
          overrides: r.overrides,
          settings: cloneSettings(r.settings),
          presetId: r.presetId,
          routeName: r.name,
          savedId: r.id,
          mode: 'route',
          area: 'plan',
          selection: null,
          editingLeg: null,
          importTrack: null,
          activePoi: null,
        });
      },
      deleteRoute: (id) =>
        set((s) => ({ library: s.library.filter((r) => r.id !== id), savedId: s.savedId === id ? null : s.savedId })),
      renameRoute: (id, name) =>
        set((s) => ({
          library: s.library.map((r) => (r.id === id ? { ...r, name } : r)),
          routeName: s.savedId === id ? name : s.routeName,
        })),
    }),
    {
      name: 'bike-planner',
      version: 1,
      // Kartenstil wird nicht übernommen: Start immer mit Luftbild DE
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<State>),
        basemap: current.basemap,
      }),
      partialize: (s) => ({
        waypoints: s.waypoints,
        settings: s.settings,
        presetId: s.presetId,
        overrides: s.overrides,
        blocks: s.blocks,
        colorMode: s.colorMode,
        view: s.view,
        mode: s.mode,
        area: s.area,
        discoverMode: s.discoverMode,
        loopStart: s.loopStart,
        loopOptions: s.loopOptions,
        exploreOptions: s.exploreOptions,
        showStops: s.showStops,
        netOverlay: s.netOverlay,
        showGpsTraces: s.showGpsTraces,
        gpsMode: s.gpsMode,
        gpsFilter: s.gpsFilter,
        gpsMulti: s.gpsMulti,
        showMyHeat: s.showMyHeat,
        networkKind: s.networkKind,
        networkGroups: s.networkGroups,
        stopCategories: s.stopCategories,
        showPhotos: s.showPhotos,
        mapillaryToken: s.mapillaryToken,
        library: s.library,
        routeName: s.routeName,
        savedId: s.savedId,
        checkedSurfaces: s.checkedSurfaces,
      }),
    },
  ),
);
