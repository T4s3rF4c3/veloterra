import { useState } from 'react';
import { Icon, type IconName } from './Icon';
import {
  BIKE_TYPES,
  PRESETS,
  PREFS,
  PREF_LABEL,
  ROADS,
  SURFACES,
  cloneSettings,
  type CategoryInfo,
  type Pref,
  type RoutingSettings,
  type TrailLevel,
} from '../domain/settings';

const PREF_ICON: Record<Pref, IconName> = { prefer: 'star', neutral: 'circle', avoid: 'arrow-down', forbid: 'x' };

function PrefControl({ value, onChange }: { value: Pref; onChange: (p: Pref) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {PREFS.map((p) => (
        <button
          key={p}
          role="radio"
          aria-checked={value === p}
          title={PREF_LABEL[p]}
          className={`seg-btn pref-${p} ${value === p ? 'on' : ''}`}
          onClick={() => onChange(p)}
        >
          <Icon name={PREF_ICON[p]} size={14} />
        </button>
      ))}
    </div>
  );
}

function CategoryList<K extends string>({
  cats,
  values,
  onChange,
}: {
  cats: CategoryInfo<K>[];
  values: Record<K, Pref>;
  onChange: (k: K, p: Pref) => void;
}) {
  return (
    <div className="cat-list">
      {cats.map((c) => (
        <div key={c.key} className="cat-row" title={c.hint}>
          <span className="dot" style={{ background: c.color }} />
          <span className="cat-label">
            {c.label}
            <small>{c.hint}</small>
          </span>
          <PrefControl value={values[c.key]} onChange={(p) => onChange(c.key, p)} />
        </div>
      ))}
    </div>
  );
}

function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="choice">
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [isOpen, setOpen] = useState(open);
  return (
    <section className={`acc ${isOpen ? 'open' : ''}`}>
      <button className="acc-head" onClick={() => setOpen(!isOpen)}>
        <span>{title}</span>
        <Icon name="chevron-right" className="chev" />
      </button>
      {isOpen && <div className="acc-body">{children}</div>}
    </section>
  );
}

interface Props {
  settings: RoutingSettings;
  presetId: string | null;
  onChange: (s: RoutingSettings, presetId: string | null) => void;
  /** Kompakte Variante für Abschnitts-Einstellungen */
  compact?: boolean;
}

export function SettingsEditor({ settings, presetId, onChange, compact }: Props) {
  const update = (fn: (s: RoutingSettings) => void) => {
    const next = cloneSettings(settings);
    fn(next);
    onChange(next, null);
  };

  const bike = settings.bike ?? 'road';
  const presets = PRESETS.filter((p) => (p.settings.bike ?? 'road') === bike);

  return (
    <div className="settings">
      <div className="choice bikes" role="radiogroup" aria-label="Radtyp">
        {BIKE_TYPES.map((b) => (
          <button
            key={b.key}
            role="radio"
            aria-checked={bike === b.key}
            className={bike === b.key ? 'on' : ''}
            onClick={() => {
              if (bike === b.key) return;
              // erstes Profil des Radtyps übernehmen
              const p = PRESETS.find((x) => x.settings.bike === b.key)!;
              onChange(cloneSettings(p.settings), p.id);
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="presets">
        {presets.map((p) => (
          <button
            key={p.id}
            className={`preset ${presetId === p.id ? 'on' : ''}`}
            onClick={() => onChange(cloneSettings(p.settings), p.id)}
            title={p.description}
          >
            <strong>{p.label}</strong>
            {!compact && <small>{p.description}</small>}
          </button>
        ))}
      </div>
      <div className="legend-prefs">
        {PREFS.map((p) => (
          <span key={p}>
            <b className={`pref-${p}`}>
              <Icon name={PREF_ICON[p]} size={12} />
            </b>{' '}
            {PREF_LABEL[p]}
          </span>
        ))}
      </div>

      <Section title="Untergrund" open={!compact}>
        <CategoryList
          cats={SURFACES}
          values={settings.surface}
          onChange={(k, p) => update((s) => void (s.surface[k] = p))}
        />
      </Section>

      <Section title="Straßenart" open={!compact}>
        <CategoryList cats={ROADS} values={settings.road} onChange={(k, p) => update((s) => void (s.road[k] = p))} />
      </Section>

      <Section title="Verkehr, Steigung & mehr">
        <label className="opt-label">Verkehrsreiche Straßen meiden</label>
        <Choice
          value={settings.traffic}
          options={[
            { value: 0, label: 'Egal' },
            { value: 0.3, label: 'Etwas' },
            { value: 1, label: 'Stark' },
          ]}
          onChange={(v) => update((s) => void (s.traffic = v))}
        />
        <label className="opt-label">Schnelle Straßen meiden (ohne Radweg)</label>
        <Choice
          value={settings.speedLimit}
          options={[
            { value: 'off', label: 'Egal' },
            { value: '70', label: 'über 70' },
            { value: '50', label: 'über 50' },
          ]}
          onChange={(v) => update((s) => void (s.speedLimit = v))}
        />
        <label className="opt-label">Trails bis Schwierigkeit</label>
        <Choice<TrailLevel>
          value={settings.trailLevel ?? 'none'}
          options={[
            { value: 'none', label: 'Egal' },
            { value: '0', label: 'S0' },
            { value: '1', label: 'S1' },
            { value: '2', label: 'S2' },
            { value: '3', label: 'S3' },
          ]}
          onChange={(v) => update((s) => void (s.trailLevel = v))}
        />
        <p className="muted small">
          MTB-Skala aus OpenStreetMap: S0 glatt und breit · S1 Wurzeln, Steine · S2 Stufen, steil · S3 verblockt.
          Schwierigere Trails werden gesperrt.
        </p>
        <label className="opt-label">Steigungen</label>
        <Choice
          value={settings.hills}
          options={[
            { value: 'ignore', label: 'Egal' },
            { value: 'moderate', label: 'Etwas meiden' },
            { value: 'strong', label: 'Flach fahren' },
          ]}
          onChange={(v) => update((s) => void (s.hills = v))}
        />
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.avoidBadSmoothness}
            onChange={(e) => update((s) => void (s.avoidBadSmoothness = e.target.checked))}
          />
          Schlechte Fahrbahn meiden <small>(smoothness)</small>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.preferCycleRoutes}
            onChange={(e) => update((s) => void (s.preferCycleRoutes = e.target.checked))}
          />
          Ausgeschilderte Radrouten bevorzugen
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.allowFerries}
            onChange={(e) => update((s) => void (s.allowFerries = e.target.checked))}
          />
          Fähren erlauben
        </label>
      </Section>
    </div>
  );
}
