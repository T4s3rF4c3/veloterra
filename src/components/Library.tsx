import { Panel } from './Panel';
import { useEffect, useState } from 'react';
import { formatKm, type LngLat } from '../domain/geo';
import type { CombinedRoute, LegResult } from '../domain/route';
import { routeThumb } from '../api/routeImage';
import { useSite } from '../api/site';
import { fetchLegs, legsKey } from '../api/sync';
import { restoreLegs, snapshotLegs } from '../hooks/useRouting';
import { useStore, type SavedRoute } from '../store';
import { Icon } from './Icon';

function save(route: CombinedRoute, asNew = false) {
  const st = useStore.getState();
  st.saveRoute(route, asNew);
  const id = useStore.getState().savedId;
  try {
    if (id) localStorage.setItem(legsKey(id), JSON.stringify(snapshotLegs()));
  } catch {
    /* Speicher voll – Route wird beim Laden neu berechnet */
  }
  // Vorschaubild im Hintergrund erzeugen
  if (id)
    void routeThumb(route.coords)
      .then((t) => useStore.getState().setRouteThumb(id, t))
      .catch(() => undefined);
}

/** Strecke einer gespeicherten Route: aus den Etappen, sonst die Wegpunkte */
async function savedCoords(r: SavedRoute): Promise<LngLat[]> {
  const legs = (await fetchLegs(r.id)) as Record<string, LegResult> | null;
  const out: LngLat[] = [];
  for (let i = 0; i < r.waypoints.length - 1; i++) {
    const leg = legs?.[`${r.waypoints[i].id}>${r.waypoints[i + 1].id}`];
    if (!leg) return r.waypoints.map((w) => [w.lng, w.lat]);
    out.push(...leg.coords);
  }
  return out;
}

/** Fehlende Vorschaubilder (ältere Routen) nach und nach erzeugen */
const tried = new Set<string>();
function useMissingThumbs(library: SavedRoute[]) {
  useEffect(() => {
    const r = library.find((x) => !x.thumb && !tried.has(x.id));
    if (!r) return;
    tried.add(r.id);
    let alive = true;
    void savedCoords(r)
      .then(routeThumb)
      .then((t) => alive && useStore.getState().setRouteThumb(r.id, t))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [library]);
}

async function load(id: string) {
  // Etappen aus diesem Browser oder – bei synchronisierten Routen – vom Konto
  const legs = await fetchLegs(id);
  if (legs) restoreLegs(legs);
  useStore.getState().loadRoute(id);
}

/** Name und Speichern – in „Meine Routen“ und direkt über dem Export. */
export function SaveRow({ route }: { route: CombinedRoute | null }) {
  const library = useStore((s) => s.library);
  const savedId = useStore((s) => s.savedId);
  const name = useStore((s) => s.routeName);
  const waypoints = useStore((s) => s.waypoints);
  const overrides = useStore((s) => s.overrides);
  const st = useStore.getState;
  const saved = library.find((r) => r.id === savedId);
  // geändert seit dem Speichern?
  const dirty = !saved || JSON.stringify([saved.waypoints, saved.overrides]) !== JSON.stringify([waypoints, overrides]);
  const upToDate = !!saved && !dirty && saved.name === name;
  return (
    <div className="save-row">
      <input
        value={name}
        onChange={(e) => st().setRouteName(e.target.value)}
        placeholder="Name der Route"
        aria-label="Name der Route"
        onKeyDown={(e) => e.key === 'Enter' && route && save(route)}
      />
      <button
        className={upToDate ? 'saved' : 'unsaved'}
        disabled={!route || upToDate}
        onClick={() => route && save(route)}
        title={saved ? 'Änderungen speichern' : 'In „Meine Routen“ speichern'}
      >
        {upToDate ? (
          <>
            <Icon name="check" size={14} /> Gespeichert
          </>
        ) : (
          <>
            <i className="dirty-dot" aria-hidden /> Speichern
          </>
        )}
      </button>
      {saved && (
        <button
          className="mini ghost"
          disabled={!route}
          onClick={() => route && save(route, true)}
          title="Als neue Route speichern"
        >
          Kopie
        </button>
      )}
    </div>
  );
}

/** Gespeicherte Routen: speichern, laden, umbenennen, löschen. */
export function Library({ route, fit }: { route: CombinedRoute | null; fit: (c: LngLat[]) => void }) {
  const library = useStore((s) => s.library);
  const savedId = useStore((s) => s.savedId);
  const waypoints = useStore((s) => s.waypoints);
  const st = useStore.getState;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const saved = library.find((r) => r.id === savedId);
  const user = useSite((s) => s.user);
  useMissingThumbs(library);

  return (
    <Panel
      id="library"
      defaultOpen
      icon="folder"
      title="Meine Routen"
      badge={library.length || undefined}
      summary={saved ? `geladen: ${saved.name}` : library.length ? 'gespeicherte Routen laden' : 'Route speichern'}
    >
      {waypoints.length >= 2 && <SaveRow route={route} />}
      {library.length === 0 ? (
        <p className="muted small">
          Noch keine Routen gespeichert.{' '}
          {user ? 'Gespeicherte Routen gibt es dann auf allen deinen Geräten.' : 'Alles bleibt in diesem Browser.'}
        </p>
      ) : (
        <ul className="list library">
          {library.map((r) => (
            <li key={r.id} className={r.id === savedId ? 'on' : ''}>
              {editing === r.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    if (draft.trim()) st().renameRoute(r.id, draft.trim());
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <button
                  className="lib-main"
                  onClick={async () => {
                    await load(r.id);
                    fit(r.waypoints.map((w) => [w.lng, w.lat]));
                  }}
                  title="Route laden"
                >
                  {r.thumb ? (
                    <img className="lib-thumb" src={r.thumb} alt="" />
                  ) : (
                    <span className="lib-thumb empty" aria-hidden />
                  )}
                  <b>{r.name}</b>
                  <small>
                    {formatKm(r.length)} · {Math.round(r.ascend)} hm · {new Date(r.savedAt).toLocaleDateString('de-DE')}
                  </small>
                </button>
              )}
              <button
                className="mini"
                onClick={() => {
                  setDraft(r.name);
                  setEditing(r.id);
                }}
                title="Umbenennen"
              >
                <Icon name="pencil" size={14} />
              </button>
              <button
                className="mini"
                onClick={() => {
                  if (confirm(`„${r.name}“ löschen?`)) {
                    st().deleteRoute(r.id);
                    localStorage.removeItem(legsKey(r.id));
                  }
                }}
                title="Löschen"
              >
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
