import { useRef, useState } from 'react';
import { clearHeat, importActivities, useHeat, type ImportResult } from '../api/heatStore';
import { useStore } from '../store';
import { Panel } from './Panel';
import { Icon } from './Icon';

/** Eigene Fahrten importieren (Strava-Export, GPX/TCX/FIT) für die persönliche Heatmap. */
export function HeatPanel() {
  const tracks = useHeat((s) => s.tracks.length);
  const km = useHeat((s) => s.km);
  const busy = useHeat((s) => s.busy);
  const show = useStore((s) => s.showMyHeat);
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const run = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setResult(null);
    try {
      setResult(await importActivities(files));
      useStore.getState().setShowMyHeat(true);
    } catch (e) {
      setError(`Import fehlgeschlagen: ${(e as Error).message}`);
      useHeat.setState({ busy: null });
    }
  };

  return (
    <Panel
      id="heat"
      defaultOpen
      icon="flame"
      title="Meine Heatmap"
      badge={tracks || undefined}
      summary={
        tracks ? `${tracks} Fahrten · ${Math.round(km).toLocaleString('de-DE')} km` : 'eigene Fahrten importieren'
      }
    >
      <p className="muted small">
        Deine gefahrenen Strecken als Kartenebene – und bei Routen und Rundtouren der Anteil, den du noch nie gefahren
        bist. Alles bleibt in diesem Browser.
      </p>
      {tracks > 0 && (
        <label className="toggle">
          <input type="checkbox" checked={show} onChange={(e) => useStore.getState().setShowMyHeat(e.target.checked)} />
          Auf der Karte zeigen
        </label>
      )}
      {busy ? (
        <div className="loop-progress">
          <div className="progress">
            <span style={{ width: `${(busy.done / Math.max(1, busy.total)) * 100}%` }} />
          </div>
          <small className="muted">
            Lese Fahrten … {busy.done}/{busy.total}
          </small>
        </div>
      ) : (
        <div className="heat-actions">
          <button className="primary" onClick={() => input.current?.click()}>
            <Icon name="upload" /> Fahrten importieren
          </button>
          {tracks > 0 && (
            <button
              className="ghost"
              onClick={() => {
                if (confirm(`Alle ${tracks} importierten Fahrten aus diesem Browser löschen?`)) void clearHeat();
              }}
            >
              Löschen
            </button>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".zip,.gpx,.tcx,.fit,.gz"
        onChange={(e) => {
          void run([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {result && (
        <p className="small heat-result">
          {result.added} Fahrten übernommen
          {result.duplicates > 0 && ` · ${result.duplicates} schon vorhanden`}
          {result.skipped > 0 && ` · ${result.skipped} übersprungen (keine Radfahrt/ohne GPS)`}
          {result.failed > 0 && ` · ${result.failed} nicht lesbar`}
        </p>
      )}
      {error && <div className="error">{error}</div>}
      <button className="link" onClick={() => setHelp(!help)}>
        {help ? 'Anleitung ausblenden' : 'Wie komme ich an meine Strava-Fahrten?'}
      </button>
      {help && (
        <ol className="small heat-help">
          <li>
            Strava im Browser öffnen → <b>Einstellungen → Mein Konto → „Konto herunterladen oder löschen“</b> → „Anfrage
            stellen“.
          </li>
          <li>Strava schickt einen Link per E-Mail (dauert meist einige Minuten bis Stunden).</li>
          <li>
            Die ZIP-Datei hier importieren – Radfahrten werden automatisch erkannt, Läufe und virtuelle Fahrten
            übersprungen.
          </li>
          <li>Komoot, Garmin & Co.: einzelne GPX-, TCX- oder FIT-Dateien auswählen (mehrere auf einmal möglich).</li>
        </ol>
      )}
    </Panel>
  );
}
