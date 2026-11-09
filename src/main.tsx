import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadHeat } from './api/heatStore';
import { loadTraceCache } from './api/osmTraces';
import { initSite } from './api/site';
import { initHistory } from './history';
import './styles.css';

// Worker explizit als Asset einbinden, sonst fehlt er im Produktions-Build
setWorkerUrl(workerUrl);

// Rückgängig/Wiederholen für Änderungen an der Route
initHistory();

// eigene Heatmap aus dem Browser-Speicher laden
void loadHeat();
void loadTraceCache();
// Veloterra-Server (Admin, seitenweite Einstellungen, vorab geladene GPS-Spuren)
void initSite();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
