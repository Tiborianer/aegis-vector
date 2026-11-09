import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RADIO_FILES = Object.freeze(JSON.parse(readFileSync(new URL('../src/audio/radio-files.json', import.meta.url), 'utf8')));
export const REQUIRED_RADIO_CUES = Object.freeze([
  'shield-hit',
  'shield-down', 'hull-critical', 'shield-restored', 'emp-ready',
  'arc-upgraded', 'nova-upgraded', 'lance-upgraded', 'wing-upgraded',
  'ion-upgraded', 'aegis-upgraded',
]);

function activeRadioFiles(radioFiles) {
  if (!radioFiles || typeof radioFiles !== 'object' || Array.isArray(radioFiles)
      || Object.keys(radioFiles).length !== REQUIRED_RADIO_CUES.length) {
    throw new Error('Radio file map must contain exactly the eleven required cues.');
  }
  return REQUIRED_RADIO_CUES.map((cue) => {
    const file = radioFiles[cue];
    if (typeof file !== 'string' || !new RegExp(`^audio/voice-v[1-9][0-9]*/${cue}\\.wav$`).test(file)) {
      throw new Error(`Invalid or missing production radio path: ${cue}`);
    }
    return file;
  });
}

export const REQUIRED_RADIO_FILES = Object.freeze(activeRadioFiles(RADIO_FILES));

const SAMPLE_RATE = 22_050;
const BLOCK_ALIGN = 2;
const MIN_SAMPLE_COUNT = SAMPLE_RATE * 0.2;
const MAX_SAMPLE_COUNT = SAMPLE_RATE * 5;
// Well below the production speech level, but above dither and isolated clicks.
const MIN_CENTERED_RMS = 32;
const MIN_CENTERED_PEAK = 128;
const ACTIVE_SAMPLE_THRESHOLD = 64;
const MIN_ACTIVE_SAMPLES = Math.ceil(SAMPLE_RATE * 0.02);

/** Decode bounded RIFF/PCM data; metadata strings can never masquerade as chunks. */
export function validateRadioWave(bytes, label = 'Radio WAV') {
  const reject = (message) => { throw new Error(`${label}: ${message}`); };
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) reject('missing or truncated RIFF/WAVE header');
  if (bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WAVE') {
    reject('must use little-endian RIFF/WAVE');
  }
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) {
    reject('RIFF size does not match file length (truncated or trailing bytes)');
  }

  let formatFound = false;
  let data;
  for (let offset = 12; offset < bytes.length;) {
    if (bytes.length - offset < 8) reject('truncated chunk header');
    const id = bytes.toString('latin1', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    const paddedEnd = end + (size & 1);
    if (paddedEnd > bytes.length) reject(`chunk ${JSON.stringify(id)} extends past RIFF boundary or lacks padding`);

    if (id === 'fmt ') {
      if (formatFound) reject('duplicate fmt chunk');
      if (size !== 16 && size !== 18) reject('PCM fmt chunk must contain 16 bytes or an empty 18-byte extension');
      if (size === 18 && bytes.readUInt16LE(start + 16) !== 0) reject('PCM fmt extension must be empty');
      const audioFormat = bytes.readUInt16LE(start);
      const channels = bytes.readUInt16LE(start + 2);
      const sampleRate = bytes.readUInt32LE(start + 4);
      const byteRate = bytes.readUInt32LE(start + 8);
      const blockAlign = bytes.readUInt16LE(start + 12);
      const bitsPerSample = bytes.readUInt16LE(start + 14);
      if (audioFormat !== 1 || channels !== 1 || sampleRate !== SAMPLE_RATE || bitsPerSample !== 16) {
        reject('must be mono 22.05kHz 16-bit PCM WAV');
      }
      if (blockAlign !== BLOCK_ALIGN || byteRate !== SAMPLE_RATE * BLOCK_ALIGN) {
        reject('PCM block alignment or byte rate is inconsistent');
      }
      formatFound = true;
    } else if (id === 'data') {
      if (!formatFound) reject('data chunk must follow a readable fmt chunk');
      if (data) reject('duplicate data chunk');
      if (size === 0 || size % BLOCK_ALIGN !== 0) reject('data must contain complete, nonempty 16-bit PCM samples');
      data = { start, end, sampleCount: size / BLOCK_ALIGN };
    }
    // Unknown ancillary chunks are legal, including odd-length padded chunks.
    offset = paddedEnd;
  }
  if (!formatFound) reject('missing fmt chunk');
  if (!data) reject('missing data chunk');
  if (data.sampleCount < MIN_SAMPLE_COUNT || data.sampleCount > MAX_SAMPLE_COUNT) {
    reject('decoded duration must be between 0.2 and 5 seconds');
  }

  let sum = 0;
  let sumSquares = 0;
  for (let offset = data.start; offset < data.end; offset += BLOCK_ALIGN) {
    const sample = bytes.readInt16LE(offset);
    sum += sample;
    sumSquares += sample * sample;
  }
  const mean = sum / data.sampleCount;
  const rms = Math.sqrt(Math.max(0, sumSquares / data.sampleCount - mean * mean));
  let peak = 0;
  let activeSampleCount = 0;
  for (let offset = data.start; offset < data.end; offset += BLOCK_ALIGN) {
    const amplitude = Math.abs(bytes.readInt16LE(offset) - mean);
    peak = Math.max(peak, amplitude);
    if (amplitude >= ACTIVE_SAMPLE_THRESHOLD) activeSampleCount += 1;
  }
  if (rms < MIN_CENTERED_RMS || peak < MIN_CENTERED_PEAK || activeSampleCount < MIN_ACTIVE_SAMPLES) {
    reject('PCM samples contain no sustained audible signal (silence, DC, near-silence, or isolated clicks)');
  }
  return {
    durationSeconds: data.sampleCount / SAMPLE_RATE,
    sampleCount: data.sampleCount,
    rms: rms / 32_768,
    peak: peak / 32_768,
    activeSampleCount,
    bytes: bytes.length,
  };
}

/** Only the versioned production pack qualifies; historical recordings are not a fallback. */
export async function verifyRadioAudio(root = 'public', { radioFiles = RADIO_FILES } = {}) {
  const failures = [];
  const recordings = [];
  for (const file of activeRadioFiles(radioFiles)) {
    const path = join(root, file);
    try {
      if (!(await stat(path)).isFile()) throw new Error(`${path}: not a regular file`);
      const metrics = validateRadioWave(await readFile(path), path);
      recordings.push({ file, ...metrics });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) {
    throw new Error(`Required radio voice verification failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  }
  return recordings;
}

// Importing this module for tests must not inspect production assets or exit the process.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = process.argv[2] ?? 'public';
  try {
    const recordings = await verifyRadioAudio(root);
    console.log(`Verified ${recordings.length} production radio voices from the active file map in ${root}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
