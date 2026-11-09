import { legKey } from '../domain/route';
import { useStore } from '../store';
import { SettingsEditor } from './SettingsEditor';
import { Icon } from './Icon';

/** Panel, um die Einstellungen eines einzelnen Abschnitts anzupassen. */
export function LegEditor() {
  const key = useStore((s) => s.editingLeg);
  const overrides = useStore((s) => s.overrides);
  const waypoints = useStore((s) => s.waypoints);
  const st = useStore.getState;
  if (!key) return null;
  const o = overrides[key];
  if (!o?.settings) return null;

  // alle zusammenhängenden Etappen mit denselben Sonder-Einstellungen gemeinsam bearbeiten
  const keys: string[] = [];
  const legKeys = waypoints.slice(0, -1).map((w, i) => legKey(w, waypoints[i + 1]));
  const idx = legKeys.indexOf(key);
  for (let i = idx; i >= 0 && overrides[legKeys[i]]?.settings === o.settings; i--) keys.unshift(legKeys[i]);
  for (let i = idx + 1; i < legKeys.length && overrides[legKeys[i]]?.settings === o.settings; i++)
    keys.push(legKeys[i]);

  return (
    <div className="leg-editor">
      <div className="leg-editor-head">
        <div>
          <h2>Abschnitt anders planen</h2>
          <p className="muted">
            Gilt nur für Etappe {idx + 1}
            {keys.length > 1 ? `–${idx + keys.length}` : ''}. Die gestrichelte Linie auf der Karte zeigt sie.
          </p>
        </div>
        <button className="ghost" onClick={() => st().setEditingLeg(null)} aria-label="Schließen">
          <Icon name="x" />
        </button>
      </div>
      <SettingsEditor
        compact
        settings={o.settings}
        presetId={o.presetLabel ?? null}
        onChange={(s, id) => {
          for (const k of keys) {
            const cur = st().overrides[k];
            st().setOverride(k, { ...cur, settings: s, presetLabel: id ?? undefined, alternative: 0 });
          }
        }}
      />
      <div className="actions">
        <button
          onClick={() => {
            for (const k of keys) st().setOverride(k, null);
            st().setEditingLeg(null);
          }}
        >
          Zurücksetzen
        </button>
        <button className="primary" onClick={() => st().setEditingLeg(null)}>
          Fertig
        </button>
      </div>
    </div>
  );
}
