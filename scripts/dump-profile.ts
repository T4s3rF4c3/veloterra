// Gibt das generierte Profil für ein Preset aus (zum Testen gegen BRouter).
// Aufruf: npx vite-node scripts/dump-profile.ts [presetId]
import { generateProfile } from '../src/domain/profile';
import { PRESETS } from '../src/domain/settings';

const id = process.argv[2] ?? 'road';
const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
process.stdout.write(generateProfile(preset.settings));
