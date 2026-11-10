import { useEffect, useRef, useState } from 'react';
import { DEFAULT_BROUTER_URL, brouterUrl } from '../api/brouter';
import { useHeat } from '../api/heatStore';
import { refreshServerIndex } from '../api/osmTraces';
import { cancelTraceJob, deleteServerTraces, saveSiteConfig, startTraceJob, traceJob, useSite } from '../api/site';
import { cellsFor, type Bbox } from '../domain/traceGrid';
import { useStore } from '../store';
import { AccountCard, LoginForm, UsersCard } from './Account';
import { Icon } from './Icon';

type Check = { state: 'idle' | 'busy' | 'ok' | 'error'; text?: string };

/** Ergebnis einer Verbindungsprüfung unter dem Feld */
function CheckLine({ check }: { check: Check }) {
  if (check.state === 'idle') return null;
  return (
    <p className={`admin-check ${check.state}`} role="status">
      {check.state === 'busy' ? (
        <span className="spinner" />
      ) : (
        <Icon name={check.state === 'ok' ? 'check' : 'x'} size={14} />
      )}
      {check.text}
    </p>
  );
}

async function testMapillary(token: string): Promise<string> {
  const v = useStore.getState().view.center;
  const bbox = [v[0] - 0.01, v[1] - 0.01, v[0] + 0.01, v[1] + 0.01].map((n) => n.toFixed(4)).join(',');
  const res = await fetch(
    `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=id&limit=5&bbox=${bbox}`,
  );
  if (res.status === 401 || res.status === 403) throw new Error('Token wird abgelehnt');
  if (!res.ok) throw new Error(`Mapillary antwortet mit Fehler ${res.status}`);
  const json = await res.json();
  return `Verbunden · ${json.data?.length ?? 0} Fotos im Kartenausschnitt gefunden`;
}

async function testBrouter(url: string): Promise<string> {
  // kurze Strecke in der Kartenmitte – ein eigener Server hat evtl. nur Kacheln für seine Region
  const [lng, lat] = useStore.getState().view.center;
  const lonlats = `${lng.toFixed(5)},${lat.toFixed(5)}|${(lng + 0.01).toFixed(5)},${(lat + 0.005).toFixed(5)}`;
  const res = await fetch(`${url}?lonlats=${lonlats}&profile=trekking&alternativeidx=0&format=geojson`, {
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok || !text.trim().startsWith('{')) throw new Error(text.trim().slice(0, 120) || `Fehler ${res.status}`);
  return 'Server rechnet Routen in der Kartenmitte';
}

async function testOverpass(url: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams({ data: '[out:json][timeout:10];node(1);out;' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Server antwortet mit Fehler ${res.status}`);
  await res.json();
  return 'Server beantwortet Abfragen';
}

/** Eintrag mit Speichern und Verbindungstest */
function ServerField({
  label,
  hint,
  value,
  placeholder,
  onSave,
  test,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  onSave: (v: string) => Promise<unknown> | void;
  test: (url: string) => Promise<string>;
}) {
  const [draft, setDraft] = useState(value);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const run = async (url: string) => {
    setCheck({ state: 'busy', text: 'Prüfe Verbindung …' });
    try {
      setCheck({ state: 'ok', text: await test(url) });
    } catch (e) {
      setCheck({ state: 'error', text: (e as Error).message || 'Keine Verbindung' });
    }
  };
  const dirty = draft.trim() !== value;
  return (
    <div className="admin-field">
      <label className="cap">{label}</label>
      <div className="admin-row">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} spellCheck={false} />
        <button
          className="primary"
          disabled={!dirty}
          onClick={async () => {
            try {
              await onSave(draft);
              setCheck({ state: 'ok', text: 'Gespeichert – gilt für alle Besucher' });
            } catch (e) {
              setCheck({ state: 'error', text: (e as Error).message });
            }
          }}
        >
          Speichern
        </button>
      </div>
      <div className="admin-actions">
        <button className="mini" onClick={() => run(draft.trim() || placeholder)}>
          Verbindung testen
        </button>
        {value && (
          <button
            className="mini ghost"
            onClick={() => {
              setDraft('');
              void onSave('');
              setCheck({ state: 'idle' });
            }}
          >
            Auf Standard zurücksetzen
          </button>
        )}
      </div>
      <CheckLine check={check} />
      <p className="muted small">{hint}</p>
    </div>
  );
}

/** Alle Daten dieses Browsers außer den Heatmap-Fahrten (IndexedDB) */
const BACKUP_KEYS = (k: string) => k.startsWith('bike-planner') || k.startsWith('veloterra');

function exportBackup() {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && BACKUP_KEYS(k)) data[k] = localStorage.getItem(k) ?? '';
  }
  const blob = new Blob(
    [JSON.stringify({ app: 'veloterra', version: 1, exportedAt: new Date().toISOString(), data }, null, 1)],
    { type: 'application/json' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `veloterra-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

type Backup = { exportedAt: string; data: Record<string, string> };

function BackupCard() {
  const library = useStore((s) => s.library.length);
  const rides = useHeat((s) => s.tracks.length);
  const user = useSite((s) => s.user);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = async (f: File) => {
    setError(null);
    try {
      const j = JSON.parse(await f.text());
      if (j?.app !== 'veloterra' || typeof j.data !== 'object') throw new Error();
      setPending({ exportedAt: j.exportedAt, data: j.data });
    } catch {
      setError('Das ist keine Veloterra-Sicherung.');
    }
  };

  return (
    <section className="card admin-card">
      <h2 className="card-title">
        <Icon name="database" size={16} /> Datensicherung
      </h2>
      <p className="muted small">
        {user ? 'Sicherung dieses Browsers' : 'Alles liegt nur in diesem Browser'}: {library} gespeicherte{' '}
        {library === 1 ? 'Route' : 'Routen'}, Einstellungen, Sperren und Zugänge
        {rides ? ` sowie ${rides} importierte Fahrten (nicht in der Sicherung)` : ''}.
        {user ? ' Routen und Fahrten liegen zusätzlich in deinem Konto.' : ''}
      </p>
      <div className="admin-actions">
        <button onClick={exportBackup}>
          <Icon name="download" size={15} /> Sicherung herunterladen
        </button>
        <button onClick={() => input.current?.click()}>
          <Icon name="upload" size={15} /> Sicherung einspielen
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void read(f);
            e.target.value = '';
          }}
        />
      </div>
      <p className="muted small">Die Sicherung enthält auch deinen Mapillary-Token – nicht weitergeben.</p>
      {error && <p className="admin-check error">{error}</p>}
      {pending && (
        <div className="admin-confirm" role="alert">
          <p>
            Sicherung vom {new Date(pending.exportedAt).toLocaleString('de-DE')} einspielen? Sie ersetzt Routen,
            Einstellungen und Zugänge in diesem Browser.
          </p>
          <div className="admin-actions">
            <button
              className="primary"
              onClick={() => {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                  const k = localStorage.key(i);
                  if (k && BACKUP_KEYS(k)) localStorage.removeItem(k);
                }
                for (const [k, v] of Object.entries(pending.data)) if (BACKUP_KEYS(k)) localStorage.setItem(k, v);
                location.reload();
              }}
            >
              Einspielen und neu laden
            </button>
            <button className="ghost" onClick={() => setPending(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Bundesländer als Rechteck (grob, etwas größer als die Landesgrenze) */
const REGIONS: { label: string; bbox: Bbox }[] = [
  { label: 'Rheinland-Pfalz', bbox: [6.11, 48.96, 8.51, 50.95] },
  { label: 'Saarland', bbox: [6.35, 49.11, 7.41, 49.64] },
  { label: 'Hessen', bbox: [7.77, 49.39, 10.24, 51.66] },
  { label: 'Baden-Württemberg', bbox: [7.51, 47.53, 10.5, 49.79] },
  { label: 'Nordrhein-Westfalen', bbox: [5.86, 50.32, 9.46, 52.53] },
  { label: 'Bayern', bbox: [8.97, 47.27, 13.84, 50.56] },
];

const duration = (cells: number) => {
  // je Kachel bis zu 3 Seiten mit Pause – grob 4–8 s
  const min = Math.round((cells * 6) / 60);
  return min < 90 ? `ca. ${Math.max(1, min)} Min.` : `ca. ${Math.round(min / 60)} Std.`;
};

/** GPS-Spuren für alle Besucher: der Server lädt sie einmal bei OpenStreetMap. */
function TracesCard({ bounds }: { bounds: () => Bbox | null }) {
  const [region, setRegion] = useState(REGIONS[0].label);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof traceJob>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await traceJob());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, 4000);
    return () => window.clearInterval(t);
  }, []);
  const job = status?.job;
  // nach einem Lauf neue Kacheln beim nächsten Kartenwechsel übernehmen
  useEffect(() => {
    if (job && !job.running) refreshServerIndex();
  }, [job?.running, job]);

  const area = (): { bbox: Bbox; label: string } | null => {
    if (region === 'view') {
      const b = bounds();
      return b ? { bbox: b, label: 'Kartenausschnitt' } : null;
    }
    const r = REGIONS.find((x) => x.label === region)!;
    return { bbox: r.bbox, label: r.label };
  };
  const a = area();
  const cells = a ? cellsFor(a.bbox).length : 0;

  const start = async (refreshAll: boolean) => {
    if (!a) return;
    setError(null);
    try {
      await startTraceJob(a.bbox, a.label, refreshAll);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="card admin-card">
      <h2 className="card-title">
        <Icon name="map" size={16} /> GPS-Spuren für alle
      </h2>
      <p className="muted small">
        Der Server lädt die öffentlichen GPS-Spuren einer Region einmal bei OpenStreetMap – langsam und nacheinander, um
        die Schnittstelle zu schonen. Danach bekommen alle Besucher sie direkt von hier, ohne eigenes Laden.
      </p>
      {status && (
        <p className="admin-active">
          <b>
            {status.stored} {status.stored === 1 ? 'Kachel' : 'Kacheln'} gespeichert
          </b>
          <small>{(status.bytes / 1e6).toFixed(1).replace('.', ',')} MB auf dem Server</small>
        </p>
      )}
      {job?.running ? (
        <div className="admin-field">
          <div className="admin-progress-head">
            <b>{job.label}</b>
            <span>
              {job.done} / {job.total}
            </span>
          </div>
          <div className="progress">
            <span style={{ width: `${(job.done / Math.max(1, job.total)) * 100}%` }} />
          </div>
          <small className="muted">
            {job.skipped > 0 && `${job.skipped} schon vorhanden · `}
            {job.failed > 0 && `${job.failed} fehlgeschlagen · `}
            läuft auch weiter, wenn du die Seite schließt
          </small>
          <div className="admin-actions">
            <button className="mini" onClick={() => cancelTraceJob().then(refresh)}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-field">
          <label className="cap" htmlFor="trace-region">
            Region
          </label>
          <select id="trace-region" className="admin-select" value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label}
              </option>
            ))}
            <option value="view">Aktueller Kartenausschnitt</option>
          </select>
          <small className="muted">
            {cells} Kacheln à 0,1° · {duration(cells)} für fehlende Kacheln
          </small>
          <div className="admin-actions">
            <button className="primary" disabled={!a} onClick={() => start(false)}>
              <Icon name="download" size={15} /> Fehlende Kacheln laden
            </button>
            <button className="mini" disabled={!a} onClick={() => start(true)}>
              Alle neu laden
            </button>
          </div>
          {job && job.finishedAt && (
            <small className="muted">
              Zuletzt: {job.label}, {job.done - job.failed - job.skipped} geladen
              {job.failed > 0 && `, ${job.failed} fehlgeschlagen`}
              {job.error && ` – ${job.error}`} · {new Date(job.finishedAt).toLocaleString('de-DE')}
            </small>
          )}
        </div>
      )}
      {error && <p className="admin-check error">{error}</p>}
      {!!status?.stored && !job?.running && (
        <div className="admin-actions">
          {!confirmDelete ? (
            <button className="mini ghost" onClick={() => setConfirmDelete(true)}>
              Alle Kacheln auf dem Server löschen
            </button>
          ) : (
            <>
              <button
                className="mini"
                onClick={async () => {
                  setConfirmDelete(false);
                  await deleteServerTraces().catch((e: Error) => setError(e.message));
                  refreshServerIndex();
                  await refresh();
                }}
              >
                Ja, {status.stored} Kacheln löschen
              </button>
              <button className="mini ghost" onClick={() => setConfirmDelete(false)}>
                Abbrechen
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Anmeldung für alle – Konten, Sync und (für Admins) die Verwaltung */
function LoginCard() {
  const loginEnabled = useSite((s) => s.loginEnabled);
  if (!loginEnabled)
    return (
      <section className="card admin-card">
        <h2 className="card-title">
          <Icon name="key" size={16} /> Anmeldung nicht eingerichtet
        </h2>
        <p className="muted small">
          Auf dem Server ist kein Admin-Passwort gesetzt. In <code>docker-compose.yml</code> beim Dienst{' '}
          <code>veloterra-api</code> die Variable <code>ADMIN_PASSWORD</code> setzen und den Dienst neu starten.
        </p>
      </section>
    );
  return (
    <section className="card admin-card">
      <h2 className="card-title">
        <Icon name="user" size={16} /> Anmelden
      </h2>
      <p className="muted small">
        Mit deinem Konto hast du gespeicherte Routen, deine Heatmap und dein Tempo auf allen Geräten. Konten legt der
        Admin an.
      </p>
      <LoginForm idPrefix="login" />
      <p className="muted small">
        Admins verwalten nach der Anmeldung außerdem Konten, Server und die GPS-Spuren für alle Besucher.
      </p>
    </section>
  );
}

/** Ohne Veloterra-Server gibt es keinen geschützten Admin-Bereich. */
function NoServerCard() {
  return (
    <section className="card admin-card">
      <h2 className="card-title">
        <Icon name="server" size={16} /> Veloterra-Server nicht gefunden
      </h2>
      <p className="muted small">
        Anmeldung, Konten mit Sync, seitenweite Einstellungen und vorab geladene GPS-Spuren brauchen den Dienst{' '}
        <code>veloterra-api</code> aus <code>docker-compose.yml</code>. Ohne ihn läuft Veloterra wie bisher nur im
        Browser; den eigenen Mapillary-Token kannst du dann in der Fotoleiste eintragen.
      </p>
    </section>
  );
}

/**
 * Login-Bereich: Anmeldung für alle, angemeldet Konto und Sync. Admins sehen
 * darunter die Verwaltung (Zugänge, Server, Konten, GPS-Spuren für alle).
 */
export function AdminPanel({ bounds }: { bounds: () => Bbox | null }) {
  const available = useSite((s) => s.available);
  const admin = useSite((s) => s.admin);
  const config = useSite((s) => s.config);
  const user = useSite((s) => s.user);
  const [draft, setDraft] = useState(config.mapillaryToken);
  const [show, setShow] = useState(false);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const active = brouterUrl();
  // gespeicherten Token übernehmen, sobald er vom Server kommt
  useEffect(() => setDraft(config.mapillaryToken), [config.mapillaryToken]);

  if (available === null) return <p className="muted small">Verbinde mit dem Server …</p>;
  // Datensicherung (Export/Import) nur angemeldet
  if (!available) return <NoServerCard />;
  if (!user) return <LoginCard />;
  if (!admin)
    return (
      <>
        <AccountCard />
        <BackupCard />
      </>
    );

  const runTest = async () => {
    setCheck({ state: 'busy', text: 'Prüfe Token …' });
    try {
      setCheck({ state: 'ok', text: await testMapillary(draft.trim()) });
    } catch (e) {
      setCheck({ state: 'error', text: (e as Error).message || 'Keine Verbindung' });
    }
  };
  const saveToken = async (v: string) => {
    try {
      await saveSiteConfig({ mapillaryToken: v.trim() });
      setCheck({ state: 'ok', text: v.trim() ? 'Gespeichert – gilt für alle Besucher' : 'Token entfernt' });
    } catch (e) {
      setCheck({ state: 'error', text: (e as Error).message });
    }
  };

  return (
    <>
      <AccountCard />
      <h2 className="area-section">Verwaltung</h2>
      <section className="card admin-card">
        <h2 className="card-title">
          <Icon name="key" size={16} /> Zugänge
        </h2>
        <div className="admin-field">
          <label className="cap" htmlFor="mapillary-token">
            Mapillary-Token
          </label>
          <div className="admin-row">
            <input
              id="mapillary-token"
              type={show ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="MLY|…"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="mini ghost"
              onClick={() => setShow(!show)}
              aria-label={show ? 'Token verbergen' : 'Token anzeigen'}
              title={show ? 'Verbergen' : 'Anzeigen'}
            >
              <Icon name={show ? 'eye-off' : 'eye'} size={16} />
            </button>
            <button
              className="primary"
              disabled={draft.trim() === config.mapillaryToken}
              onClick={() => saveToken(draft)}
            >
              Speichern
            </button>
          </div>
          <div className="admin-actions">
            <button className="mini" disabled={!draft.trim()} onClick={runTest}>
              Verbindung testen
            </button>
            {config.mapillaryToken && (
              <button
                className="mini ghost"
                onClick={() => {
                  setDraft('');
                  void saveToken('');
                }}
              >
                Token entfernen
              </button>
            )}
          </div>
          <CheckLine check={check} />
          <p className="muted small">
            Für deutlich mehr Straßenfotos im Belags-Check und in der Fotoleiste – für alle Besucher. Einen Client-Token
            gibt es kostenlos unter{' '}
            <a href="https://www.mapillary.com/dashboard/developers" target="_blank" rel="noreferrer">
              mapillary.com/dashboard/developers
            </a>
            . Er ist für die Nutzung im Browser gedacht und daher für Besucher einsehbar.
          </p>
        </div>
      </section>

      <section className="card admin-card">
        <h2 className="card-title">
          <Icon name="server" size={16} /> Server
        </h2>
        <p className="admin-active">
          Routing läuft über <b>{active}</b>
          <small>
            {/^https:\/\/brouter\.de\//.test(active) ? 'öffentlicher Server, gedrosselt' : 'eigener Server'}
          </small>
        </p>
        <ServerField
          label="BRouter-Server"
          hint="Leer lassen für die Container-Einstellung bzw. brouter.de. Gilt für alle Besucher, sofort für neue Berechnungen."
          value={config.brouterUrl}
          placeholder={DEFAULT_BROUTER_URL}
          onSave={(v) => saveSiteConfig({ brouterUrl: v.trim().replace(/\/+$/, '') })}
          test={testBrouter}
        />
        <ServerField
          label="Overpass-Server (Stopps, Ziele, Belag)"
          hint="Wird vor den öffentlichen Servern gefragt. Leer lassen für die öffentlichen."
          value={config.overpassUrl}
          placeholder="https://overpass-api.de/api/interpreter"
          onSave={(v) => saveSiteConfig({ overpassUrl: v.trim() })}
          test={testOverpass}
        />
      </section>

      <UsersCard />
      <TracesCard bounds={bounds} />
      <BackupCard />
    </>
  );
}
