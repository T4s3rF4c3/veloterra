import type { LngLat } from '../domain/geo';

/**
 * Bild einer Route: Luftbild (Esri World Imagery) als Hintergrund, leicht
 * abgedunkelt, darauf die Strecke mit Start und Ziel. Klein als Vorschau in
 * „Meine Routen“, groß (1200×630) mit Name und Kennzahlen als Vorschaubild
 * für Teilen-Links. Ohne Netz bleibt der Hintergrund dunkel.
 */

const TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};

function loadImage(src: string, timeout = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => resolve(null), timeout);
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    img.src = src;
  });
}

export interface RouteImageOptions {
  width: number;
  height: number;
  /** Ränder in Pixeln um die Strecke */
  pad: { top: number; right: number; bottom: number; left: number };
  title?: string;
  subtitle?: string;
}

export async function renderRouteImage(coords: LngLat[], o: RouteImageOptions): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = o.width;
  canvas.height = o.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#18191b';
  ctx.fillRect(0, 0, o.width, o.height);
  if (coords.length < 2) return canvas;

  // Ausschnitt in Web-Mercator (0..1)
  const xs = coords.map((c) => mercX(c[0]));
  const ys = coords.map((c) => mercY(c[1]));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const aw = o.width - o.pad.left - o.pad.right;
  const ah = o.height - o.pad.top - o.pad.bottom;
  // Pixel je Welteinheit; höchstens Zoom 16, damit kurze Strecken nicht zu nah sind
  const S = Math.min(aw / Math.max(maxX - minX, 1e-9), ah / Math.max(maxY - minY, 1e-9), 256 * 2 ** 16);
  const cx = o.pad.left + aw / 2;
  const cy = o.pad.top + ah / 2;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const px = (x: number) => cx + (x - midX) * S;
  const py = (y: number) => cy + (y - midY) * S;

  // Kacheln der passenden Zoomstufe (eher eine Stufe schärfer als nötig)
  const z = Math.max(1, Math.min(17, Math.ceil(Math.log2(S / 256))));
  const n = 2 ** z;
  const size = S / n;
  const x0 = Math.floor((midX - cx / S) * n);
  const x1 = Math.floor((midX + (o.width - cx) / S) * n);
  const y0 = Math.max(0, Math.floor((midY - cy / S) * n));
  const y1 = Math.min(n - 1, Math.floor((midY + (o.height - cy) / S) * n));
  const jobs: Promise<void>[] = [];
  for (let tx = x0; tx <= x1; tx++)
    for (let ty = y0; ty <= y1; ty++) {
      const wx = ((tx % n) + n) % n;
      jobs.push(
        loadImage(`${TILE}/${z}/${ty}/${wx}`).then((img) => {
          if (img) ctx.drawImage(img, px(tx / n), py(ty / n), size + 0.5, size + 0.5);
        }),
      );
    }
  await Promise.all(jobs);

  // abdunkeln, damit die Strecke heraussticht
  ctx.fillStyle = 'rgb(12 14 18 / 0.38)';
  ctx.fillRect(0, 0, o.width, o.height);

  const lw = Math.max(2.5, o.width / 260);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(px(xs[0]), py(ys[0]));
    for (let i = 1; i < xs.length; i++) ctx.lineTo(px(xs[i]), py(ys[i]));
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  path();
  ctx.strokeStyle = 'rgb(10 12 16 / 0.85)';
  ctx.lineWidth = lw + Math.max(3, lw);
  ctx.stroke();
  path();
  ctx.strokeStyle = '#8ab4f8';
  ctx.lineWidth = lw;
  ctx.stroke();

  const dot = (x: number, y: number, color: string) => {
    ctx.beginPath();
    ctx.arc(px(x), py(y), lw * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, lw / 2);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  };
  const last = xs.length - 1;
  const loop = Math.abs(xs[0] - xs[last]) * S < lw * 3 && Math.abs(ys[0] - ys[last]) * S < lw * 3;
  if (!loop) dot(xs[last], ys[last], '#f28b82');
  dot(xs[0], ys[0], '#81c995');

  if (o.title || o.subtitle) {
    const h = o.height;
    const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
    g.addColorStop(0, 'rgb(0 0 0 / 0)');
    g.addColorStop(1, 'rgb(0 0 0 / 0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.55, o.width, h * 0.45);
    const left = Math.round(o.width * 0.055);
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgb(0 0 0 / 0.5)';
    ctx.shadowBlur = 8;
    if (o.title) {
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${Math.round(h * 0.085)}px Roboto, system-ui, sans-serif`;
      ctx.fillText(fit(ctx, o.title, o.width - 2 * left), left, h - Math.round(h * 0.15));
    }
    if (o.subtitle) {
      ctx.fillStyle = '#d2d6db';
      ctx.font = `400 ${Math.round(h * 0.05)}px Roboto, system-ui, sans-serif`;
      ctx.fillText(o.subtitle, left, h - Math.round(h * 0.075));
    }
    // Absender oben links
    const logo = await loadImage('/icon-192.png', 3000);
    const ls = Math.round(h * 0.075);
    if (logo) ctx.drawImage(logo, left, left * 0.6, ls, ls);
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.round(h * 0.045)}px Roboto, system-ui, sans-serif`;
    ctx.fillText('Veloterra', left + (logo ? ls + ls * 0.3 : 0), left * 0.6 + ls * 0.7);
    ctx.shadowBlur = 0;
  }
  // Pflichtangabe der Luftbilder
  ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
  ctx.font = `400 ${Math.max(8, Math.round(o.height * 0.022))}px Roboto, system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('Luftbild © Esri', o.width - 6, o.height - 5);
  return canvas;
}

/** Titel kürzen, bis er passt */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Kleine Vorschau für „Meine Routen“ (JPEG als data-URL, ~15 KB) */
export async function routeThumb(coords: LngLat[]): Promise<string> {
  const c = await renderRouteImage(coords, {
    width: 288,
    height: 180,
    pad: { top: 16, right: 16, bottom: 16, left: 16 },
  });
  return c.toDataURL('image/jpeg', 0.72);
}

/** Vorschaubild für Teilen-Links (1200×630, wie es Messenger erwarten) */
export async function shareImage(coords: LngLat[], title: string, subtitle: string): Promise<Blob | null> {
  const c = await renderRouteImage(coords, {
    width: 1200,
    height: 630,
    pad: { top: 110, right: 90, bottom: 200, left: 90 },
    title,
    subtitle,
  });
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.84));
}
