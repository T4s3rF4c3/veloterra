import { useEffect, useState } from 'react';
import {
  changePassword,
  createUser,
  deleteUser,
  listUsers,
  login,
  logout,
  updateUser,
  useSite,
  type AccountInfo,
} from '../api/site';
import { syncNow, useSync } from '../api/sync';
import { useStore } from '../store';
import { Icon } from './Icon';

const MIN_PASSWORD = 8;

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'gerade eben';
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  return new Date(t).toLocaleDateString('de-DE');
}

/** Anmeldung mit Benutzername und Passwort (für „Meine“ und den Admin-Bereich) */
export function LoginForm({ idPrefix }: { idPrefix: string }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="account-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await login(name.trim(), password);
          setPassword('');
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="cap" htmlFor={`${idPrefix}-user`}>
        Benutzername
      </label>
      <input
        id={`${idPrefix}-user`}
        className="field"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="cap" htmlFor={`${idPrefix}-password`}>
        Passwort
      </label>
      <input
        id={`${idPrefix}-password`}
        className="field"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p className="admin-check error" role="alert">
          <Icon name="x" size={14} /> {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={!password || busy}>
        {busy ? 'Melde an …' : 'Anmelden'}
      </button>
    </form>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const short = next.length > 0 && next.length < MIN_PASSWORD;
  return (
    <form
      className="account-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await changePassword(current, next);
          setOk(true);
          setCurrent('');
          setNext('');
          setTimeout(onDone, 1500);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label className="cap" htmlFor="pw-current">
        Bisheriges Passwort
      </label>
      <input
        id="pw-current"
        className="field"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <label className="cap" htmlFor="pw-next">
        Neues Passwort
      </label>
      <input
        id="pw-next"
        className="field"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        aria-describedby="pw-hint"
      />
      <small id="pw-hint" className={short ? 'field-hint warn' : 'field-hint'}>
        Mindestens {MIN_PASSWORD} Zeichen. Andere Geräte werden danach abgemeldet.
      </small>
      {error && <p className="admin-check error">{error}</p>}
      {ok && (
        <p className="admin-check ok">
          <Icon name="check" size={14} /> Passwort geändert
        </p>
      )}
      <div className="admin-actions">
        <button className="primary" type="submit" disabled={!current || next.length < MIN_PASSWORD}>
          Passwort ändern
        </button>
        <button type="button" className="ghost" onClick={onDone}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function SyncLine() {
  const { status, at, error } = useSync();
  // „vor x Min.“ aktuell halten
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (status === 'busy')
    return (
      <p className="admin-check busy" role="status">
        <span className="spinner" /> Gleiche ab …
      </p>
    );
  if (status === 'error')
    return (
      <p className="admin-check error" role="alert">
        <Icon name="x" size={14} /> Sync fehlgeschlagen: {error}
      </p>
    );
  return (
    <p className="admin-check ok" role="status">
      <Icon name="check" size={14} /> {at ? `Synchronisiert ${ago(at)}` : 'Bereit zum Abgleich'}
    </p>
  );
}

/** Konto im Login-Bereich: Sync-Status, Passwort, abmelden */
export function AccountCard() {
  const user = useSite((s) => s.user);
  const [pw, setPw] = useState(false);
  if (!user) return null;

  return (
    <section className="card admin-card account-card">
      <div className="account-head">
        <span className="account-avatar" aria-hidden>
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="account-name">
          <b>{user.name}</b>
          <small>{user.role === 'admin' ? 'Admin' : 'Konto'} auf diesem Server</small>
        </span>
        <button className="mini ghost" onClick={() => void logout()} title="Abmelden – Daten bleiben in diesem Browser">
          Abmelden
        </button>
      </div>
      <SyncLine />
      {pw ? (
        <PasswordForm onDone={() => setPw(false)} />
      ) : (
        <div className="admin-actions">
          <button onClick={() => void syncNow()}>
            <Icon name="refresh" size={15} /> Jetzt abgleichen
          </button>
          {!user.env && (
            <button className="ghost" onClick={() => setPw(true)}>
              <Icon name="key" size={15} /> Passwort ändern
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Admin: Konten anlegen, Passwort zurücksetzen, Rechte, löschen */
export function UsersCard() {
  const me = useSite((s) => s.user);
  const [users, setUsers] = useState<AccountInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(false);
  const [reset, setReset] = useState<{ id: string; password: string } | null>(null);
  const [remove, setRemove] = useState<AccountInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = () =>
    listUsers()
      .then(setUsers)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void reload();
  }, []);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await reload();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  return (
    <section className="card admin-card">
      <h2 className="card-title">
        <Icon name="user" size={16} /> Konten
      </h2>
      <p className="muted small">
        Jedes Konto hat eigene Routen, Heatmap und Tempo – synchronisiert auf allen Geräten, auf denen man sich
        anmeldet.
      </p>
      {!users && !error && <p className="muted small">Lade Konten …</p>}
      {users && (
        <ul className="list users">
          {users.map((u) => (
            <li key={u.id}>
              <span>
                <b>
                  {u.name}
                  {u.role === 'admin' && <em className="role-chip">Admin</em>}
                </b>
                <small>
                  {u.routes} {u.routes === 1 ? 'Route' : 'Routen'} · {u.rides} Fahrten
                  {u.env ? ' · Passwort aus ADMIN_PASSWORD' : ''}
                </small>
              </span>
              {!u.env && (
                <>
                  <button
                    className="mini"
                    title="Passwort zurücksetzen"
                    aria-label={`Passwort von ${u.name} zurücksetzen`}
                    onClick={() => setReset(reset?.id === u.id ? null : { id: u.id, password: '' })}
                  >
                    <Icon name="key" size={14} />
                  </button>
                  {u.id !== me?.id && (
                    <button
                      className="mini"
                      title={u.role === 'admin' ? 'Admin-Rechte entziehen' : 'Zum Admin machen'}
                      aria-label={
                        u.role === 'admin' ? `${u.name}: Admin-Rechte entziehen` : `${u.name} zum Admin machen`
                      }
                      onClick={() =>
                        act(
                          () => updateUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' }),
                          u.role === 'admin' ? `${u.name} ist kein Admin mehr` : `${u.name} ist jetzt Admin`,
                        )
                      }
                    >
                      <Icon name="gear" size={14} />
                    </button>
                  )}
                  {u.id !== me?.id && (
                    <button
                      className="mini"
                      title="Konto löschen"
                      aria-label={`Konto ${u.name} löschen`}
                      onClick={() => setRemove(u)}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {reset && (
        <form
          className="account-form inset"
          onSubmit={async (e) => {
            e.preventDefault();
            const u = users?.find((x) => x.id === reset.id);
            if (
              await act(
                () => updateUser(reset.id, { password: reset.password }),
                `Neues Passwort für ${u?.name} gesetzt`,
              )
            )
              setReset(null);
          }}
        >
          <label className="cap" htmlFor="reset-pw">
            Neues Passwort für {users?.find((x) => x.id === reset.id)?.name}
          </label>
          <div className="admin-row">
            <input
              id="reset-pw"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={reset.password}
              onChange={(e) => setReset({ ...reset, password: e.target.value })}
              autoFocus
            />
            <button className="primary" type="submit" disabled={reset.password.length < MIN_PASSWORD}>
              Setzen
            </button>
          </div>
          <small className="field-hint">Mindestens {MIN_PASSWORD} Zeichen. Das Konto wird überall abgemeldet.</small>
        </form>
      )}
      {remove && (
        <div className="admin-confirm" role="alert">
          <p>
            Konto <b>{remove.name}</b> mit {remove.routes} Routen und {remove.rides} Fahrten endgültig löschen? Das
            lässt sich nicht rückgängig machen.
          </p>
          <div className="admin-actions">
            <button
              className="danger"
              onClick={async () => {
                const n = remove.name;
                setRemove(null);
                await act(() => deleteUser(remove.id), `Konto ${n} gelöscht`);
              }}
            >
              {remove.name} löschen
            </button>
            <button className="ghost" onClick={() => setRemove(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      <form
        className="account-form inset"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = name.trim();
          if (await act(() => createUser(n, password, admin ? 'admin' : 'user'), `Konto ${n} angelegt`)) {
            setName('');
            setPassword('');
            setAdmin(false);
          }
        }}
      >
        <b className="account-form-title">Konto anlegen</b>
        <label className="cap" htmlFor="new-user">
          Benutzername
        </label>
        <input
          id="new-user"
          className="field"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="cap" htmlFor="new-pw">
          Passwort
        </label>
        <input
          id="new-pw"
          className="field"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <small className="field-hint">
          Mindestens {MIN_PASSWORD} Zeichen – der Person mitteilen, sie kann es danach selbst ändern.
        </small>
        <label className="toggle">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
          Admin-Rechte (Server, Konten und GPS-Spuren verwalten)
        </label>
        <button className="primary" type="submit" disabled={name.trim().length < 2 || password.length < MIN_PASSWORD}>
          <Icon name="plus" size={15} /> Konto anlegen
        </button>
      </form>
      {notice && (
        <p className="admin-check ok" role="status">
          <Icon name="check" size={14} /> {notice}
        </p>
      )}
      {error && (
        <p className="admin-check error" role="alert">
          <Icon name="x" size={14} /> {error}
        </p>
      )}
    </section>
  );
}

/** Kurzer Hinweis unter „Meine“: synchronisiert – oder Einladung zum Login */
export function SyncHint() {
  const available = useSite((s) => s.available);
  const loginEnabled = useSite((s) => s.loginEnabled);
  const user = useSite((s) => s.user);
  const { status, at } = useSync();
  if (!available || !loginEnabled) return null;
  const go = () => useStore.getState().setArea('admin');
  if (!user)
    return (
      <button className="sync-hint" onClick={go}>
        <Icon name="user" size={16} />
        <span>
          <b>Auf allen Geräten nutzen</b>
          <small>Anmelden, um Routen, Heatmap und Tempo zu synchronisieren</small>
        </span>
        <Icon name="chevron-right" size={16} />
      </button>
    );
  return (
    <button className="sync-hint" onClick={go} title="Konto und Sync">
      <span className="account-avatar small" aria-hidden>
        {user.name.slice(0, 1).toUpperCase()}
      </span>
      <span>
        <b>{user.name}</b>
        <small>
          {status === 'busy'
            ? 'Gleiche ab …'
            : status === 'error'
              ? 'Sync fehlgeschlagen – Details im Konto'
              : at
                ? `Synchronisiert ${ago(at)}`
                : 'Synchronisiert'}
        </small>
      </span>
      <Icon name="chevron-right" size={16} />
    </button>
  );
}
