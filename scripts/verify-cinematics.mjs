import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? 'public';
const storyFiles = [
  ...['01', '02', '03'].map((n) => `story/first-signal/first-signal-${n}.webp`),
  ...['01', '02', '03'].map((n) => `story/warden-key/warden-key-${n}.webp`),
  ...['01', '02'].map((n) => `story/forked-truth/forked-truth-${n}.webp`),
  ...['01', '02', '03'].map((n) => `story/stillwater-directive/stillwater-${n}.webp`),
  ...['01', '02', '03'].map((n) => `story/project-crown/project-crown-${n}.webp`),
  ...['01', '02', '03'].map((n) => `story/rook-confession/rook-confession-${n}.webp`),
  ...['01', '02', '03'].map((n) => `story/last-vector/last-vector-${n}.webp`),
];
const keyframes = Array.from({ length: 5 }, (_, index) => [
  `cinematics/keyframes/scene-0${index + 1}-start.webp`,
  `cinematics/keyframes/scene-0${index + 1}-end.webp`,
]).flat();

let storyBytes = 0;
for (const relative of [...storyFiles, ...keyframes]) {
  const path = join(root, relative);
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || info.size < 8 * 1024) throw new Error(`Missing, empty, or truncated cinematic asset: ${path}`);
  const header = await readFile(path);
  if (header.subarray(0, 4).toString('ascii') !== 'RIFF' || header.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error(`Cinematic asset is not WebP: ${path}`);
  }
  if (relative.startsWith('story/')) {
    if (info.size > 320 * 1024) throw new Error(`Story panel exceeds 320KB: ${path} (${info.size} bytes)`);
    storyBytes += info.size;
  }
}

if (storyFiles.length !== 20) throw new Error(`Expected exactly 20 story panels, mapped ${storyFiles.length}`);
if (storyBytes > 6.5 * 1024 * 1024) throw new Error(`Story panel set exceeds 6.5MB (${storyBytes} bytes)`);
console.log(`Verified ${storyFiles.length} story panels and ${keyframes.length} intro keyframes in ${root} (${Math.round(storyBytes / 1024)}KB story set).`);
