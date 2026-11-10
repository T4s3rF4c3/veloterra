import { install, usePwa } from '../pwa';
import { Icon } from './Icon';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

/** Veloterra als App installieren – startet schneller und zeigt die letzte Route auch offline. */
export function InstallCard() {
  const prompt = usePwa((s) => s.prompt);
  const installed = usePwa((s) => s.installed);
  if (installed || (!prompt && !isIos())) return null;
  return (
    <section className="card admin-card install-card">
      <h2 className="card-title">
        <Icon name="download" size={16} /> Als App installieren
      </h2>
      <p className="muted small">
        Startet wie eine App vom Startbildschirm, lädt schneller und zeigt die zuletzt geplante Route samt bereits
        angesehener Karte auch ohne Netz.
      </p>
      {prompt ? (
        <div className="admin-actions">
          <button className="primary" onClick={() => void install()}>
            <Icon name="download" size={15} /> Installieren
          </button>
        </div>
      ) : (
        <p className="small">
          In Safari auf <b>Teilen</b> tippen und <b>„Zum Home-Bildschirm“</b> wählen.
        </p>
      )}
    </section>
  );
}
