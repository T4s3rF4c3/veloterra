import { Panel } from './Panel';
import { useState } from 'react';
import { formatKm, type LngLat } from '../domain/geo';
import type { CombinedRoute } from '../domain/route';
import { restoreLegs, snapshotLegs } from '../hooks/useRouting';
import { useStore } from '../store';

/** Etappen gespeicherter Routen liegen getrennt, damit die Liste klein bleibt. */
const legsKey = (id: string) => `bike-planner-route-${id}`;

function save(route: CombinedRoute, asNew = false) {
  const st = useStore.getState();
  st.saveRoute(route, asNew);
  const id = useStore.getState().savedId;
  try {
    if (id) localStorage.setItem(legsKey(id), JSON.stringify(snapshotLegs()));
  } catch {
    /* Speicher voll – Route wird beim Laden neu berechnet */
  }
}

function load(id: string) {
  try {
    restoreLegs(JSON.parse(localStorage.getItem(legsKey(id)) ?? '{}'));
  } catch {
    /* ignorieren */
  }
  useStore.getState().loadRoute(id);
}

/** Gespeicherte Routen: speichern, laden, umbenennen, löschen. */
export function Library({ route, fit }: { route: CombinedRoute | null; fit: (c: LngLat[]) => void }) {
  const library = useStore((s) => s.library);
  const savedId = useStore((s) => s.savedId);
  const name = useStore((s) => s.routeName);
  const waypoints = useStore((s) => s.waypoints);
  const overrides = useStore((s) => s.overrides);
  const st = useStore.getState;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const saved = library.find((r) => r.id === savedId);
  // geändert seit dem Speichern?
  const dirty = !saved || JSON.stringify([saved.waypoints, saved.overrides]) !== JSON.stringify([waypoints, overrides]);

  return (
    <Panel
      id="library"
      icon="📁"
      title="Meine Routen"
      badge={library.length || undefined}
      summary={saved ? `geladen: ${saved.name}` : library.length ? 'gespeicherte Routen laden' : 'Route speichern'}
    >
      {waypoints.length >= 2 && (
        <div className="save-row">
          <input
            value={name}
            onChange={(e) => st().setRouteName(e.target.value)}
            placeholder="Name der Route"
            onKeyDown={(e) => e.key === 'Enter' && route && save(route)}
          />
          <button
            className="primary"
            disabled={!route || (!dirty && saved?.name === name)}
            onClick={() => route && save(route)}
            title={saved ? 'Änderungen speichern' : 'In „Meine Routen“ speichern'}
          >
            {saved && !dirty && saved.name === name ? 'Gespeichert ✓' : 'Speichern'}
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
      )}
      {library.length === 0 ? (
        <p className="muted small">Noch keine Routen gespeichert. Alles bleibt in diesem Browser.</p>
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
                  onClick={() => {
                    load(r.id);
                    fit(r.waypoints.map((w) => [w.lng, w.lat]));
                  }}
                  title="Route laden"
                >
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
                ✎
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
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
