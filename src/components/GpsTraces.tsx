import { useEffect } from 'react';
import {
  MAX_CELLS,
  cancelTraces,
  clearTraceCache,
  loadRegion,
  regionStatus,
  syncFromServer,
  useTraces,
} from '../api/osmTraces';
import { CELL } from '../domain/traceGrid';
import { useStore } from '../store';
import { Icon } from './Icon';

const FILTERS: { value: 'bike' | 'fast'; label: string; hint: string }[] = [
  { value: 'bike', label: 'Alle Rad-Spuren', hint: 'Spuren mit Rad-Tempo (Median 7,5–38 km/h)' },
  { value: 'fast', label: 'Rennrad-Tempo', hint: 'Spuren mit flottem Tempo (Median ab 23 km/h)' },
];

/** ungefähre Fläche einer Kachel in km² (in Mitteleuropa) */
const CELL_KM2 = Math.round(CELL * 111 * CELL * 111 * Math.cos((50 * Math.PI) / 180));

/** Einstellungen der öffentlichen GPS-Spuren im Ebenen-Menü. */
export function GpsTracesOptions({ bounds }: { bounds: () => [number, number, number, number] | null }) {
  const mode = useStore((s) => s.gpsMode);
  const filter = useStore((s) => (s.gpsFilter === 'fast' ? 'fast' : 'bike'));
  const multi = useStore((s) => s.gpsMulti);
  const notice = useTraces((s) => s.notice);
  const loading = useTraces((s) => s.loading);
  const error = useTraces((s) => s.error);
  const counts = useTraces((s) => s.counts);
  const cells = useTraces((s) => s.cells);
  useTraces((s) => s.version);
  const st = useStore.getState;
  const bikes = counts.bike + counts.fast;
  const others = counts.foot + counts.motor + counts.unknown;
  const stored = Object.keys(cells).length;
  const b = bounds();
  const status = b ? regionStatus(b) : null;
  // beim Einschalten: vom Server vorab geladene Kacheln des Ausschnitts holen
  useEffect(() => {
    const v = bounds();
    if (v) void syncFromServer(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gps-options">
      <div className="choice wrap">
        <button className={mode === 'density' ? 'on' : ''} onClick={() => st().setGpsMode('density')}>
          Dichte (viel/wenig)
        </button>
        <button className={mode === 'lines' ? 'on' : ''} onClick={() => st().setGpsMode('lines')}>
          Linien
        </button>
      </div>
      {mode === 'lines' && <p className="muted small">Alle Spuren weltweit; die Farbe zeigt nur die Fahrtrichtung.</p>}
      {mode === 'density' && (
        <>
          <div className="choice wrap">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                className={filter === f.value ? 'on' : ''}
                onClick={() => st().setGpsFilter(f.value)}
                title={f.hint}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="gps-loading">
              <span className="spinner" />
              <span>
                Lade Kachel {loading.done + 1} von {loading.total} …
              </span>
              <button className="mini" onClick={cancelTraces}>
                Abbrechen
              </button>
            </div>
          ) : status && status.missing > 0 ? (
            <button
              className="primary gps-load"
              disabled={status.missing > MAX_CELLS}
              onClick={() => b && loadRegion(b)}
              title="Fehlende Kacheln des sichtbaren Bereichs laden und dauerhaft im Browser speichern"
            >
              Bereich laden ({status.missing} {status.missing === 1 ? 'Kachel' : 'Kacheln'})
            </button>
          ) : status ? (
            <p className="small good-tag">
              <Icon name="check" size={13} /> Sichtbarer Bereich ist gespeichert
            </p>
          ) : null}
          {status && status.missing > MAX_CELLS && !loading && (
            <p className="muted small">
              Zu viele Kacheln auf einmal – bitte etwas hineinzoomen (höchstens {MAX_CELLS}).
            </p>
          )}
          <label className="toggle">
            <input type="checkbox" checked={multi} onChange={(e) => st().setGpsMulti(e.target.checked)} />
            Nur mehrfach befahrene Wege <small>(blendet einzelne Zufallsspuren aus)</small>
          </label>
          {error && <p className="small warn-text">{error}</p>}
          {notice && <p className="small warn-text">{notice}</p>}

          {stored > 0 && (
            <div className="gps-cache">
              <p className="muted small">
                Gespeichert: {stored} {stored === 1 ? 'Kachel' : 'Kacheln'} (ca. {stored * CELL_KM2} km², gestrichelt) ·{' '}
                <b>{bikes} Rad-Spuren</b>
                {counts.fast > 0 && ` (davon ${counts.fast} Rennrad-Tempo)`}
                {others > 0 && ` · ${others} andere (zu Fuß, Auto, ohne Zeit) nicht gezeigt`}. Bleibt im Browser –
                Zoomen lädt nichts nach. Spuren enden an den Kachelrändern; Nachbarbereich laden, um sie fortzusetzen.
              </p>
              <div className="gps-cache-actions">
                {status && status.missing < status.total && (
                  <button
                    className="mini"
                    disabled={!!loading || status.total > MAX_CELLS}
                    onClick={() => b && loadRegion(b, true)}
                    title="Kacheln des sichtbaren Bereichs neu von OpenStreetMap laden"
                  >
                    <Icon name="refresh" size={14} /> Bereich aktualisieren
                  </button>
                )}
                <button
                  className="mini ghost"
                  onClick={() => {
                    if (confirm(`Alle ${stored} gespeicherten Kacheln löschen?`)) void clearTraceCache();
                  }}
                >
                  Alle löschen
                </button>
              </div>
            </div>
          )}
          <p className="muted small">
            Ob eine Spur eine Radfahrt ist, wird aus dem Tempo geschätzt; GPS-Sprünge und Lücken werden entfernt.
          </p>
        </>
      )}
    </div>
  );
}

/** Farbskala auf der Karte, wenn die Dichte sichtbar ist. */
export function DensityLegend() {
  const show = useStore((s) => s.showGpsTraces && s.gpsMode === 'density');
  const filter = useStore((s) => s.gpsFilter);
  const stored = useTraces((s) => Object.keys(s.cells).length);
  const loading = useTraces((s) => s.loading);
  if (!show) return null;
  return (
    <div className="density-legend">
      <b>Rad-Spuren {filter === 'fast' ? '(Rennrad-Tempo)' : ''}</b>
      {stored ? (
        <span className="ramp-row">
          wenig <span className="ramp" /> viel
        </span>
      ) : (
        <span className="muted">{loading ? 'lädt …' : 'Ebenen → „Bereich laden“'}</span>
      )}
    </div>
  );
}
