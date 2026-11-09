import { useEffect, useState } from 'react';
import { usePhotos } from '../hooks/usePhotos';
import type { CombinedRoute } from '../domain/route';
import { useStore } from '../store';
import { Icon } from './Icon';

/** Fotos entlang der Route als Streifen über dem Höhenprofil, mit Großansicht. */
export function PhotoStrip({ route }: { route: CombinedRoute }) {
  const { loading, error } = usePhotos(route);
  const photos = useStore((s) => s.photos);
  const activeId = useStore((s) => s.activePhoto);
  const token = useStore((s) => s.mapillaryToken);
  const st = useStore.getState;
  const [showToken, setShowToken] = useState(false);
  const [draft, setDraft] = useState(token);
  const idx = photos.findIndex((p) => p.id === activeId);
  const active = idx >= 0 ? photos[idx] : null;

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') st().setActivePhoto(null);
      if (e.key === 'ArrowRight' && idx < photos.length - 1) st().setActivePhoto(photos[idx + 1].id);
      if (e.key === 'ArrowLeft' && idx > 0) st().setActivePhoto(photos[idx - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, idx, photos, st]);

  useEffect(() => {
    if (active) st().setHoverDistance(active.along);
  }, [active, st]);

  return (
    <div className="photos">
      <div className="photos-head">
        <b>Fotos der Strecke</b>
        <small className="muted">
          {loading
            ? `suche … ${photos.length} gefunden`
            : photos.length
              ? `${photos.length} Fotos · Panoramax${token ? ' + Mapillary' : ''}`
              : 'keine Fotos gefunden'}
        </small>
        {error && <small className="warn-text">{error}</small>}
        <span className="spacer" />
        <button className="mini ghost" onClick={() => setShowToken(!showToken)} title="Mapillary verbinden">
          <Icon name={token ? 'check' : 'plus'} size={13} /> Mapillary
        </button>
        <button className="mini ghost" onClick={() => st().setShowPhotos(false)} aria-label="Fotos schließen">
          <Icon name="x" size={14} />
        </button>
      </div>
      {showToken && (
        <div className="photos-token">
          <p className="muted small">
            Mapillary hat viel mehr Fotos, auch auf dem Land. Kostenlosen Client-Token unter{' '}
            <a href="https://www.mapillary.com/dashboard/developers" target="_blank" rel="noreferrer">
              mapillary.com/dashboard/developers
            </a>{' '}
            erstellen und hier einfügen (wird nur in deinem Browser gespeichert).
          </p>
          <div className="row">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="MLY|…" />
            <button
              className="primary mini"
              onClick={() => {
                st().setMapillaryToken(draft);
                setShowToken(false);
              }}
            >
              Speichern
            </button>
          </div>
        </div>
      )}
      {photos.length > 0 && (
        <div className="photos-row">
          {photos.map((p) => (
            <button
              key={p.id}
              className={`thumb ${p.id === activeId ? 'on' : ''}`}
              onMouseEnter={() => st().setHoverDistance(p.along)}
              onMouseLeave={() => !activeId && st().setHoverDistance(null)}
              onClick={() => st().setActivePhoto(p.id)}
            >
              <img src={p.thumb} alt="" loading="lazy" />
              <span>km {(p.along / 1000).toFixed(0)}</span>
            </button>
          ))}
        </div>
      )}
      {!loading && !photos.length && !token && (
        <p className="muted small">
          Panoramax hat hier noch keine Fotos. Mit einem Mapillary-Token findest du meist deutlich mehr.
        </p>
      )}
      {active && (
        <div className="lightbox" onClick={() => st().setActivePhoto(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={active.full} alt="" />
            <figcaption>
              <span>
                km {(active.along / 1000).toFixed(1).replace('.', ',')}
                {active.date && ` · ${new Date(active.date).toLocaleDateString('de-DE')}`}
                {active.author && ` · © ${active.author}`}
              </span>
              <a href={active.link} target="_blank" rel="noreferrer">
                Bei {active.source === 'mapillary' ? 'Mapillary' : 'Panoramax'} öffnen ↗
              </a>
            </figcaption>
            <button
              className="lb-nav prev"
              disabled={idx <= 0}
              onClick={() => st().setActivePhoto(photos[idx - 1].id)}
              aria-label="Vorheriges Foto"
            >
              <Icon name="chevron-left" size={24} />
            </button>
            <button
              className="lb-nav next"
              disabled={idx >= photos.length - 1}
              onClick={() => st().setActivePhoto(photos[idx + 1].id)}
              aria-label="Nächstes Foto"
            >
              <Icon name="chevron-right" size={24} />
            </button>
            <button className="lb-close" onClick={() => st().setActivePhoto(null)} aria-label="Schließen">
              <Icon name="x" size={20} />
            </button>
          </figure>
        </div>
      )}
    </div>
  );
}
