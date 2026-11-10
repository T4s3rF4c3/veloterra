import { useEffect, useState } from 'react';
import { commonsFile, commonsNear, type CommonsPhoto } from '../api/commons';
import type { Poi } from '../domain/poi';

/**
 * Suchradius: Sehenswürdigkeiten werden oft aus der Entfernung fotografiert,
 * bei Cafés oder Werkstätten zeigt ein weiter Radius schnell das Nachbarhaus.
 */
function photoRadius(poi: Poi) {
  const t = poi.tags;
  if (t.natural === 'water' || t.natural === 'peak' || t.historic === 'castle' || t.historic === 'ruins') return 600;
  if (t.historic || t.tourism === 'viewpoint' || t.tourism === 'attraction' || t.leisure === 'park') return 350;
  return 120;
}

/**
 * Titelbild für ein Ziel bzw. einen Stopp: das Bild aus OpenStreetMap
 * (wikimedia_commons=File:…), sonst die schönsten Commons-Fotos im Umkreis.
 */
export function PoiPhotos({ poi }: { poi: Poi }) {
  const [photos, setPhotos] = useState<CommonsPhoto[] | null>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    let alive = true;
    setPhotos(null);
    setI(0);
    const file = poi.tags.wikimedia_commons;
    Promise.all([
      file?.startsWith('File:') ? commonsFile(file, poi.coord) : Promise.resolve(null),
      commonsNear(poi.coord, photoRadius(poi), 5).catch(() => []),
    ]).then(([own, near]) => {
      if (!alive) return;
      const list = [...(own ? [own] : []), ...near.filter((p) => p.id !== own?.id)].slice(0, 5);
      setPhotos(list);
    });
    return () => {
      alive = false;
    };
  }, [poi]);

  if (photos === null) return <div className="poi-hero loading" aria-hidden />;
  if (!photos.length) return null;
  const p = photos[Math.min(i, photos.length - 1)];
  return (
    <figure className="poi-hero">
      <a href={p.link} target="_blank" rel="noreferrer" title={`${p.title} – bei Wikimedia Commons öffnen`}>
        <img src={p.thumb} alt={p.title} />
      </a>
      <figcaption>
        © {p.author ?? 'unbekannt'}
        {p.license && ` · ${p.license}`} · Wikimedia Commons
      </figcaption>
      {photos.length > 1 && (
        <div className="poi-hero-dots" role="group" aria-label="Weitere Fotos">
          {photos.map((x, k) => (
            <button
              key={x.id}
              className={k === i ? 'on' : ''}
              onClick={() => setI(k)}
              aria-label={`Foto ${k + 1}: ${x.title}`}
              title={x.title}
            />
          ))}
        </div>
      )}
    </figure>
  );
}
