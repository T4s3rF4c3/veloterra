import { useEffect, useRef, useState } from 'react';
import { renderSVG } from 'uqr';
import { createShareLink, type ShareLink } from '../api/share';
import type { CombinedRoute } from '../domain/route';
import { useSite } from '../api/site';
import { useStore } from '../store';
import { Icon } from './Icon';

/** Größer passt kaum noch zuverlässig in einen QR-Code */
const QR_MAX = 2000;

function ShareSheet({ route, onClose }: { route: CombinedRoute | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const user = useSite((s) => s.user);
  const hasImport = useStore((s) => Object.values(s.overrides).some((o) => o.presetLabel === 'Import'));

  useEffect(() => {
    ref.current?.showModal();
    createShareLink(route)
      .then(setLink)
      .catch((e: Error) => setError(e.message));
    // Route steht beim Öffnen fest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => void (link?.image && URL.revokeObjectURL(link.image)), [link]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ohne Zugriff auf die Zwischenablage: Feld ist markierbar */
    }
  };

  const qr = link && link.url.length <= QR_MAX ? renderSVG(link.url, { border: 2, ecc: 'L' }) : null;

  return (
    <dialog
      ref={ref}
      className="share-dialog"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="share-title"
    >
      <div className="share-body">
        <header className="share-head">
          <h2 id="share-title">Route teilen</h2>
          <button className="mini ghost" onClick={() => ref.current?.close()} aria-label="Schließen">
            <Icon name="x" size={16} />
          </button>
        </header>
        {!link && !error && (
          <p className="admin-check busy" role="status">
            <span className="spinner" /> Link wird erstellt …
          </p>
        )}
        {error && <p className="admin-check error">{error}</p>}
        {link && (
          <>
            {link.image && (
              <img className="share-preview" src={link.image} alt="Vorschau, wie sie im Messenger erscheint" />
            )}
            {qr ? (
              <div
                className="share-qr"
                role="img"
                aria-label="QR-Code des Links"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            ) : (
              <p className="muted small">
                Die Route ist zu umfangreich für einen QR-Code.{' '}
                {user ? '' : 'Angemeldet entsteht ein kurzer Link, der passt.'}
              </p>
            )}
            <div className="admin-row">
              <input
                value={link.url}
                readOnly
                aria-label="Link zur Route"
                onFocus={(e) => e.target.select()}
                spellCheck={false}
              />
              <button className="primary" onClick={copy}>
                <Icon name={copied ? 'check' : 'link'} size={15} /> {copied ? 'Kopiert' : 'Kopieren'}
              </button>
            </div>
            {'share' in navigator && (
              <button
                onClick={() =>
                  navigator
                    .share({ title: useStore.getState().routeName || 'Route', url: link.url })
                    .catch(() => undefined)
                }
              >
                <Icon name="external" size={15} /> Über eine App teilen …
              </button>
            )}
            <p className="muted small">
              {link.short
                ? 'Kurzer Link über diesen Veloterra-Server – die Route kommt genau so beim Empfänger an.'
                : 'Die Route steckt im Link selbst; der Empfänger berechnet sie mit deinen Einstellungen neu.'}
              {!link.short && hasImport && ' Importierte Abschnitte werden dabei neu geplant.'} Sie lässt sich danach
              frei bearbeiten und speichern.
            </p>
          </>
        )}
      </div>
    </dialog>
  );
}

/** Knopf „Teilen“ neben dem Export */
export function ShareButton({ route }: { route: CombinedRoute | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="share-btn" disabled={!route} onClick={() => setOpen(true)} title="Link und QR-Code zur Route">
        <Icon name="share" size={16} /> Teilen
      </button>
      {open && <ShareSheet route={route} onClose={() => setOpen(false)} />}
    </>
  );
}
