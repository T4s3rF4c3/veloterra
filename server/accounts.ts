/**
 * Benutzerkonten und Sitzungen des Veloterra-Servers.
 *
 * - Konten liegen in users.json (Passwort als scrypt-Hash mit Salt).
 * - Der Admin aus ADMIN_PASSWORD ist ein festes Konto „admin“: Sein Passwort
 *   kommt immer aus der Umgebung und wird nicht gespeichert.
 * - Sitzungen liegen in sessions.json, gespeichert wird nur ein Hash des
 *   Tokens – ein Blick in die Datei reicht nicht, um sich anzumelden.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type Role = 'admin' | 'user';

export interface User {
  id: string;
  name: string;
  role: Role;
  createdAt: number;
  /** scrypt$N$salt$hash (hex); fehlt beim Admin aus der Umgebung */
  hash?: string;
}

export interface PublicUser {
  id: string;
  name: string;
  role: Role;
  /** Admin aus ADMIN_PASSWORD (Passwort nur über die Umgebung änderbar) */
  env: boolean;
}

export const ENV_ADMIN_ID = 'admin';
export const VALID_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,31}$/;
export const MIN_PASSWORD = 8;
const SCRYPT_N = 16384;

export class Accounts {
  private users = new Map<string, User>();
  private sessions = new Map<string, { uid: string; until: number }>();
  private saving: Promise<void> = Promise.resolve();

  private dir: string;
  private envPassword: string;
  private envName: string;
  private sessionDays: number;

  constructor(dir: string, envPassword: string, envName: string, sessionDays: number) {
    this.dir = dir;
    this.envPassword = envPassword;
    this.envName = envName;
    this.sessionDays = sessionDays;
  }

  async load() {
    try {
      const j = JSON.parse(await readFile(join(this.dir, 'users.json'), 'utf8')) as { users: User[] };
      for (const u of j.users ?? []) if (u.id !== ENV_ADMIN_ID) this.users.set(u.id, u);
    } catch {
      /* noch keine Konten */
    }
    try {
      const j = JSON.parse(await readFile(join(this.dir, 'sessions.json'), 'utf8')) as Record<
        string,
        { uid: string; until: number }
      >;
      const now = Date.now();
      for (const [k, v] of Object.entries(j)) if (v.until > now) this.sessions.set(k, v);
    } catch {
      /* keine Sitzungen */
    }
  }

  /** Gibt es überhaupt eine Möglichkeit, sich anzumelden? */
  get loginEnabled() {
    return !!this.envPassword || this.users.size > 0;
  }

  private envAdmin(): User | null {
    return this.envPassword ? { id: ENV_ADMIN_ID, name: this.envName, role: 'admin', createdAt: 0 } : null;
  }

  get(id: string): User | null {
    return id === ENV_ADMIN_ID ? this.envAdmin() : (this.users.get(id) ?? null);
  }

  list(): User[] {
    const env = this.envAdmin();
    return [...(env ? [env] : []), ...[...this.users.values()].sort((a, b) => a.name.localeCompare(b.name))];
  }

  static toPublic(u: User): PublicUser {
    return { id: u.id, name: u.name, role: u.role, env: u.id === ENV_ADMIN_ID };
  }

  private byName(name: string): User | null {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    const env = this.envAdmin();
    if (env && env.name.toLowerCase() === n) return env;
    for (const u of this.users.values()) if (u.name.toLowerCase() === n) return u;
    return null;
  }

  /** Name und Passwort prüfen. Ohne Namen: Admin aus der Umgebung (wie früher). */
  async verify(name: string, password: string): Promise<User | null> {
    const u = name.trim() ? this.byName(name) : this.envAdmin();
    if (u?.id === ENV_ADMIN_ID) return safeEqual(password, this.envPassword) ? u : null;
    if (!u?.hash) {
      // gleich lange rechnen wie bei einem echten Konto
      await hashPassword(password);
      return null;
    }
    return (await checkPassword(password, u.hash)) ? u : null;
  }

  async create(name: string, password: string, role: Role): Promise<User> {
    name = name.trim();
    if (!VALID_NAME.test(name))
      throw new Error('Benutzername: 2–32 Zeichen, nur Buchstaben, Ziffern, Punkt, Binde- und Unterstrich');
    if (this.byName(name) || name.toLowerCase() === this.envName.toLowerCase())
      throw new Error('Diesen Benutzernamen gibt es schon');
    checkStrength(password);
    const u: User = {
      id: randomBytes(9).toString('hex'),
      name,
      role,
      createdAt: Date.now(),
      hash: await hashPassword(password),
    };
    this.users.set(u.id, u);
    await this.saveUsers();
    return u;
  }

  async update(id: string, patch: { password?: string; role?: Role }, keepSession?: string) {
    const u = this.users.get(id);
    if (!u) throw new Error(id === ENV_ADMIN_ID ? 'Der Admin wird über ADMIN_PASSWORD verwaltet' : 'Unbekanntes Konto');
    if (patch.password !== undefined) {
      checkStrength(patch.password);
      u.hash = await hashPassword(patch.password);
      // überall abmelden – außer in der Sitzung, die das Passwort ändert
      for (const [k, s] of this.sessions) if (s.uid === id && k !== keepSession) this.sessions.delete(k);
      await this.saveSessions();
    }
    if (patch.role) u.role = patch.role;
    await this.saveUsers();
    return u;
  }

  async remove(id: string) {
    if (!this.users.delete(id)) throw new Error('Unbekanntes Konto');
    for (const [k, s] of this.sessions) if (s.uid === id) this.sessions.delete(k);
    await Promise.all([this.saveUsers(), this.saveSessions()]);
  }

  /* ---------- Sitzungen ---------- */

  async startSession(uid: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(tokenHash(token), { uid, until: Date.now() + this.sessionDays * 86400_000 });
    await this.saveSessions();
    return token;
  }

  /** Konto zur Sitzung oder null (abgelaufen, gelöscht, Admin-Passwort entfernt). */
  userFor(token: string | undefined): User | null {
    if (!token) return null;
    const key = tokenHash(token);
    const s = this.sessions.get(key);
    if (!s) return null;
    const u = this.get(s.uid);
    if (s.until < Date.now() || !u) {
      this.sessions.delete(key);
      return null;
    }
    return u;
  }

  sessionKey(token: string | undefined) {
    return token ? tokenHash(token) : undefined;
  }

  async endSession(token: string | undefined) {
    if (token && this.sessions.delete(tokenHash(token))) await this.saveSessions();
  }

  /* ---------- Speichern ---------- */

  private write(file: string, data: unknown) {
    // nacheinander schreiben, erst in eine Hilfsdatei – nie halb geschriebene Dateien
    this.saving = this.saving.then(async () => {
      const path = join(this.dir, file);
      await writeFile(`${path}.tmp`, JSON.stringify(data));
      await rename(`${path}.tmp`, path);
    });
    return this.saving;
  }

  private saveUsers() {
    return this.write('users.json', { users: [...this.users.values()] });
  }

  private saveSessions() {
    const now = Date.now();
    for (const [k, s] of this.sessions) if (s.until < now) this.sessions.delete(k);
    return this.write('sessions.json', Object.fromEntries(this.sessions));
  }
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const digest = (s: string) => createHash('sha256').update(s).digest();
const safeEqual = (a: string, b: string) => !!b && timingSafeEqual(digest(a), digest(b));

function checkStrength(password: string) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD)
    throw new Error(`Passwort: mindestens ${MIN_PASSWORD} Zeichen`);
  if (password.length > 200) throw new Error('Passwort zu lang');
}

function scryptAsync(password: string, salt: Buffer, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_N);
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const key = await scryptAsync(password, Buffer.from(salt, 'hex'), Number(n));
  const want = Buffer.from(hash, 'hex');
  return key.length === want.length && timingSafeEqual(key, want);
}
