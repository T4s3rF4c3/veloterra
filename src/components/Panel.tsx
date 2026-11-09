import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

const KEY = 'veloterra-panels';

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readOpen(), [id]: open }));
  } catch {
    /* ohne Speicher eben nicht merken */
  }
}

/**
 * Aufklappbarer Bereich der Seitenleiste. Zugeklappt zeigt er nur Titel und
 * eine kurze Zusammenfassung; ob er offen ist, merkt sich der Browser.
 */
export function Panel({
  id,
  title,
  icon,
  summary,
  badge,
  defaultOpen = false,
  actions,
  tone,
  children,
}: {
  id: string;
  title: string;
  icon?: IconName;
  /** kurze Info im zugeklappten Zustand */
  summary?: ReactNode;
  /** Zähler/Hinweis rechts im Kopf */
  badge?: ReactNode;
  defaultOpen?: boolean;
  /** Knöpfe im Kopf (z. B. Schließen) */
  actions?: ReactNode;
  /** Hervorhebung, z. B. offene Hinweise */
  tone?: 'warn';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen()[id] ?? defaultOpen);
  const toggle = () => {
    setOpen(!open);
    writeOpen(id, !open);
  };
  return (
    <section className={`card panel ${open ? 'open' : ''} ${tone ? `tone-${tone}` : ''}`}>
      <div className="panel-head">
        <button className="panel-toggle-btn" onClick={toggle} aria-expanded={open}>
          {icon && (
            <span className="panel-icon" aria-hidden>
              <Icon name={icon} size={18} />
            </span>
          )}
          <span className="panel-title">
            <b>{title}</b>
            {!open && summary && <small>{summary}</small>}
          </span>
          {badge !== undefined && badge !== null && badge !== false && <span className="panel-badge">{badge}</span>}
          <Icon name="chevron-right" className="chev" />
        </button>
        {actions}
      </div>
      {open && <div className="panel-body">{children}</div>}
    </section>
  );
}
