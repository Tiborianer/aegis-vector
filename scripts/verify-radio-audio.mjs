import { access, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2] ?? 'public';
const requiredFiles = [
  'shield-down.wav', 'hull-critical.wav', 'shield-restored.wav', 'emp-ready.wav',
  'arc-upgraded.wav', 'nova-upgraded.wav', 'lance-upgraded.wav', 'wing-upgraded.wav',
  'ion-upgraded.wav', 'aegis-upgraded.wav',
];
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
    if (isWave) {
      const formatOffset = signature.indexOf(Buffer.from('fmt '));
      if (formatOffset < 0 || signature.length < formatOffset + 24) failures.push(`${path} has no readable PCM format chunk`);
      else {
        const audioFormat = signature.readUInt16LE(formatOffset + 8);
        const channels = signature.readUInt16LE(formatOffset + 10);
        const sampleRate = signature.readUInt32LE(formatOffset + 12);
        const bitsPerSample = signature.readUInt16LE(formatOffset + 22);
        if (audioFormat !== 1 || channels !== 1 || sampleRate !== 22_050 || bitsPerSample !== 16) {
          failures.push(`${path} must be mono 22.05kHz 16-bit PCM WAV`);
        }
      }
    }
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`Required radio voice verification failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log(`Verified ${requiredFiles.length} production radio voices in ${root}/audio/voice.`);
