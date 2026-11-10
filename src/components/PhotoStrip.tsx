import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePhotos } from '../hooks/usePhotos';
import type { CombinedRoute } from '../domain/route';
import { useStore } from '../store';
import { Icon } from './Icon';
import { useSite } from '../api/site';

/** Fotos entlang der Route als Streifen über dem Höhenprofil, mit Großansicht. */
export function PhotoStrip({ route }: { route: CombinedRoute }) {
  const { loading, error } = usePhotos(route);
  const photos = useStore((s) => s.photos);
  const activeId = useStore((s) => s.activePhoto);
  const siteToken = useSite((s) => s.config.mapillaryToken);
  const token = useStore((s) => s.mapillaryToken) || siteToken;
  const source = useStore((s) => s.photoSource);
  const open = useStore((s) => s.photosOpen);
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
    <div className={`photos ${open ? '' : 'collapsed'}`}>
      <div className="photos-head">
        <button
          className="mini ghost photos-toggle"
          onClick={() => st().setPhotosOpen(!open)}
          aria-expanded={open}
          title={open ? 'Fotoleiste einklappen' : 'Fotos zeigen'}
        >
          <Icon name={open ? 'chevron-down' : 'chevron-up'} size={16} />
          <b>Fotos der Strecke</b>
          {!open && photos.length > 0 && <span className="photos-count">{photos.length}</span>}
        </button>
        <div className="choice photo-source" role="group" aria-label="Fotoquelle">
          <button
            className={source === 'commons' ? 'on' : ''}
            onClick={() => st().setPhotoSource('commons')}
            title="Schöne Fotos von Wikimedia Commons: Burgen, Aussichten, Orte – bis 400 m neben der Strecke"
          >
            Highlights
          </button>
          <button
            className={source === 'street' ? 'on' : ''}
            onClick={() => st().setPhotoSource('street')}
            title="Straßenfotos in Fahrtrichtung (Panoramax, Mapillary) – zeigt Belag und Weg"
          >
            Straße
          </button>
        </div>
        <small className="muted">
          {loading
            ? `suche … ${photos.length} gefunden`
            : photos.length
              ? source === 'commons'
                ? `${photos.length} Fotos · Wikimedia Commons`
                : `${photos.length} Fotos · Panoramax${token ? ' + Mapillary' : ''}`
              : 'keine Fotos gefunden'}
        </small>
        {error && <small className="warn-text">{error}</small>}
        <span className="spacer" />
        {source === 'street' && (
          <button className="mini ghost" onClick={() => setShowToken(!showToken)} title="Mapillary verbinden">
            <Icon name={token ? 'check' : 'plus'} size={13} /> Mapillary
          </button>
        )}
        <button className="mini ghost" onClick={() => st().setShowPhotos(false)} aria-label="Fotos schließen">
          <Icon name="x" size={14} />
        </button>
      </div>
      {open && showToken && source === 'street' && (
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
      {open && photos.length > 0 && (
        <div className="photos-row">
          {photos.map((p) => (
            <button
              key={p.id}
              className={`thumb ${p.id === activeId ? 'on' : ''}`}
              onMouseEnter={() => st().setHoverDistance(p.along)}
              onMouseLeave={() => !activeId && st().setHoverDistance(null)}
              onClick={() => st().setActivePhoto(p.id)}
              title={p.title}
            >
              <img src={p.thumb} alt={p.title ?? ''} loading="lazy" />
              <span>km {(p.along / 1000).toFixed(0)}</span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && !photos.length && source === 'commons' && (
        <p className="muted small">
          Entlang dieser Strecke gibt es auf Wikimedia Commons keine passenden Fotos. „Straße“ zeigt Straßenfotos.
        </p>
      )}
      {open && !loading && !photos.length && source === 'street' && !token && (
        <p className="muted small">
          Panoramax hat hier noch keine Fotos. Mit einem Mapillary-Token findest du meist deutlich mehr.
        </p>
      )}
      {/* an die Seite gehängt: liegt sonst unter der Seitenleiste (eigene Ebene der Kartenleiste) */}
      {active &&
        createPortal(
          <div className="lightbox" onClick={() => st().setActivePhoto(null)}>
            <figure onClick={(e) => e.stopPropagation()}>
              <img src={active.full} alt="" />
              <figcaption>
                <span>
                  {active.title && <b className="lb-title">{active.title}</b>}
                  km {(active.along / 1000).toFixed(1).replace('.', ',')}
                  {active.date && ` · ${new Date(active.date).toLocaleDateString('de-DE')}`}
                  {active.author && ` · © ${active.author}`}
                  {active.license && ` · ${active.license}`}
                </span>
                <a href={active.link} target="_blank" rel="noreferrer">
                  Bei{' '}
                  {active.source === 'mapillary'
                    ? 'Mapillary'
                    : active.source === 'commons'
                      ? 'Wikimedia Commons'
                      : 'Panoramax'}{' '}
                  öffnen ↗
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
          </div>,
          document.body,
        )}
    </div>
  );
}
