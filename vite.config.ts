import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // MapLibre 6 lädt seinen Worker relativ zu import.meta.url –
  // das Vorbündeln durch Vite würde den Pfad brechen.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // Veloterra-Server im Entwicklungsbetrieb (npm run dev:server)
  // kurze Teilen-Links /s/<id> liefert ebenfalls der Veloterra-Server
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      // Host beibehalten, damit die Vorschau-Seite die richtige Adresse fürs Bild nennt
      '^/s/[A-Za-z0-9_-]+/?$': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
});
