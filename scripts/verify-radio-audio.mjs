import { access, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? 'public';
const requiredFiles = ['shield-down.wav', 'hull-critical.wav', 'arc-upgraded.wav'];
const failures = [];

for (const file of requiredFiles) {
  const path = join(root, 'audio', 'voice', file);
  try {
    await access(path);
    const info = await stat(path);
    const signature = await readFile(path, { encoding: null });
    const isWave = signature.subarray(0, 4).toString('ascii') === 'RIFF'
      && signature.subarray(8, 12).toString('ascii') === 'WAVE';
    if (info.size < 4_096) failures.push(`${path} is empty or truncated (${info.size} bytes)`);
    if (!isWave) failures.push(`${path} does not have a WAV header`);
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`Required radio voice verification failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log(`Verified ${requiredFiles.length} production radio voices in ${root}/audio/voice.`);
