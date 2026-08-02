import { access, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? 'public';
const files = [
  'menu.mp3',
  'hangar.mp3',
  'mission-coastal.mp3',
  'mission-minefield.mp3',
  'mission-fortress.mp3',
  'boss.mp3',
  'boss-mech-tyrants.mp3',
  'victory-coastal.mp3',
  'victory-minefield.mp3',
  'victory-fortress.mp3',
  'victory-campaign.mp3',
  'defeat-signal.mp3',
  'defeat-debrief.mp3',
];

const failures = [];
for (const file of files) {
  const path = join(root, 'audio', file);
  try {
    await access(path);
    const info = await stat(path);
    const signature = await readFile(path, { encoding: null });
    const hasMp3Header = signature.subarray(0, 3).toString('ascii') === 'ID3'
      || (signature[0] === 0xff && (signature[1] & 0xe0) === 0xe0);
    if (info.size < 1_024) failures.push(`${path} is empty or truncated (${info.size} bytes)`);
    if (!hasMp3Header) failures.push(`${path} does not have an MP3 header`);
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`Required production soundtrack verification failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log(`Verified ${files.length} production soundtrack files in ${root}/audio.`);
