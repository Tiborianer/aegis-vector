// Active release asset contract, shared by desktop and web staging.
// Public originals stay untouched; retained candidates never enter a release.
import { readFileSync } from 'node:fs';
const missionScores = JSON.parse(readFileSync(new URL('../src/audio/mission-scores.json', import.meta.url), 'utf8'));
const radioFiles = JSON.parse(readFileSync(new URL('../src/audio/radio-files.json', import.meta.url), 'utf8'));
// Keep explicit names in sync with runtime manifests; never guess from minified bundles.
const numbered = (directory, count, extension, prefix = '') => Array.from({ length: count }, (_, i) =>
  `${directory}/${prefix}${String(i + 1).padStart(2, '0')}.${extension}`);

export const DESKTOP_PUBLIC_ASSETS = Object.freeze([
  ...Object.values(missionScores).filter((score) => score.status === 'reviewed').map((score) => score.file),
  ...[
    'menu', 'hangar', 'mission-coastal', 'mission-minefield', 'mission-fortress',
    'boss', 'boss-mech-tyrants', 'victory-coastal', 'victory-minefield',
    'victory-fortress', 'victory-campaign', 'defeat-signal', 'defeat-debrief',
    'ending/homeward-vector-v1',
  ].map((name) => `audio/${name}.mp3`),
  // Only approved active mappings enter staging; unreviewed replacements stay out.
  ...Object.values(radioFiles),
  ...numbered('story-v5/first-signal', 6, 'webp'),
  ...numbered('story-v5/warden-key', 7, 'webp'),
  ...numbered('story-v5/rook-confession', 3, 'webp'),
  ...numbered('story-v5/last-vector', 3, 'webp'),
  ...numbered('story-v3/forked-truth', 6, 'jpg').map((file) => file.endsWith('/03.jpg') ? 'story-v3/forked-truth/03-v5.webp' : file),
  ...['stillwater-directive', 'project-crown'].flatMap((chapter) => numbered(`story-v3/${chapter}`, 6, 'jpg')),
  ...numbered('story-v4/homeward', 4, 'webp', 'homeward-'),
  ...['aurora-arrival', 'aurora-hana', 'aurora-vale', 'fortress-breach', 'fortress-shield']
    .map((name) => `story-v6/${name}.webp`),
  ...[
    'player', 'scout', 'interceptor', 'bomber', 'elite', 'charger', 'sniper', 'mineLayer',
    'shieldCarrier', 'bulwark', 'phantom', 'artillery', 'reclaimer', 'razorwing', 'gatekeeper',
    'pursuer', 'carrierBoss', 'warden', 'boss', 'drone', 'droneMk2', 'skimmer', 'weaver',
    'seraph', 'nullArchitect', 'prism', 'leech',
  ].map((name) => `graphics-v2/ships/${name}.png`),
  'graphics-v2/modules/crown-turret.png',
  'graphics-v2/modules/crown-turret.json',
  'graphics-v2/modules/seraph-wing-left.png',
  'graphics-v2/modules/seraph-wing-right.png',
  'graphics-v2/modules/seraph-wings.json',
  ...['coastal', 'minefield', 'aurora', 'fortress', 'stormbreak', 'graveyard', 'carrierSiege', 'dreadnought', 'cirrus']
    .map((name) => `graphics-v2/environments/${name}.webp`),
  ...[
    'rapid-cycling', 'amplified-munitions', 'split-capacitors', 'hunter-logic',
    'overdrive-reactor', 'phase-arsenal', 'ordnance-cascade', 'prismatic-core',
    'reinforced-frame', 'aegis-bank', 'quick-charge-loop', 'reactive-armor',
    'phoenix-protocol', 'repulsor-shield', 'second-wind', 'kinetic-reversal',
    'salvage-protocol', 'tractor-array', 'emp-overcharger', 'combat-computer',
    'field-fabricator', 'flux-capacitor', 'chrono-relay', 'emergency-capacitor',
    'swarm-doctrine', 'resonance-matrix', 'helios-battery', 'gravity-payload',
    'nanite-lattice', 'aegis-harmonics', 'guardian-pulse', 'fortress-frame',
    'threat-analyzer', 'salvage-router', 'temporal-echo', 'fabrication-matrix',
    'reserve-emp', 'armament-scanner', 'emergency-nanites', 'wingman-beacon',
  ].map((name) => `ui/upgrades/${name}.png`),
  ...['aegis-vector-mark.svg', 'icon-16.png', 'icon-32.png', 'icon-48.png', 'apple-touch-icon.png',
    'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'share-card-v1.jpg'].map((name) => `brand/${name}`),
  'site.webmanifest',
  'cinematics/keyframes/scene-01-start.webp',
  'cinematics/video/aegis-vector-intro-v2.mp4',
]);

const assetSet = new Set(DESKTOP_PUBLIC_ASSETS);
export function isDesktopAsset(relative) {
  return relative === 'index.html' || assetSet.has(relative)
    || /^assets\/[A-Za-z0-9_-]+\.(?:js|css)$/.test(relative);
}
