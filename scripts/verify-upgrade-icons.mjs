import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? 'public';
const ids = [
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
];

let totalBytes = 0;
for (const id of ids) {
  const path = join(root, 'ui', 'upgrades', `${id}.png`);
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || info.size <= 0) throw new Error(`Missing or empty upgrade icon: ${path}`);
  if (info.size > 128 * 1024) throw new Error(`Upgrade icon exceeds 128KB: ${path} (${info.size} bytes)`);
  const header = await readFile(path);
  const pngSignature = '89504e470d0a1a0a';
  if (header.subarray(0, 8).toString('hex') !== pngSignature) throw new Error(`Upgrade icon is not PNG: ${path}`);
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width !== 256 || height !== 256) throw new Error(`Upgrade icon must be 256x256: ${path} is ${width}x${height}`);
  totalBytes += info.size;
}

if (totalBytes > 4 * 1024 * 1024) throw new Error(`Upgrade icon set exceeds 4MB (${totalBytes} bytes)`);
console.log(`Verified ${ids.length} upgrade icons in ${root}/ui/upgrades (${Math.round(totalBytes / 1024)}KB).`);
