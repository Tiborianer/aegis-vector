import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const REQUIRED_FILES = [
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
  'ending/homeward-vector-v1.mp3',
];

export const REQUIRED_MISSION_SCORE_TRACKS = [
  'mission-stormbreak', 'mission-graveyard', 'mission-carrier-siege',
  'mission-dreadnought', 'mission-last-light', 'mission-aurora',
];

export async function verifyAudio(root = 'public', options = {}) {
  const storyScores = options.storyScores ?? JSON.parse(await readFile(new URL('../src/audio/story-scores.json', import.meta.url), 'utf8'));
  const missionScores = options.missionScores ?? JSON.parse(await readFile(new URL('../src/audio/mission-scores.json', import.meta.url), 'utf8'));
  const warn = options.warn ?? console.warn;
  const files = [...REQUIRED_FILES];
  const missionFiles = new Set(['mission-coastal.mp3', 'mission-minefield.mp3', 'mission-fortress.mp3']);
  for (const track of REQUIRED_MISSION_SCORE_TRACKS) {
    if (!Object.hasOwn(missionScores, track)) throw new Error(`Missing mission score manifest entry: ${track}`);
  }
  for (const [track, score] of Object.entries(missionScores)) {
    if (!REQUIRED_MISSION_SCORE_TRACKS.includes(track)) throw new Error(`Unknown mission score manifest entry: ${track}`);
    if (!score || !['awaiting-elevenlabs', 'generated', 'reviewed'].includes(score.status)) throw new Error(`Invalid mission score status: ${track}`);
    if (score.status !== 'reviewed') {
      if (options.requireMissionScores) throw new Error(`${track}: distinct ElevenLabs mission score generation/listening review is still pending.`);
      warn(`${track}: generation/listening review pending; ${score.fallback} is the declared temporary bed.`);
      continue;
    }
    if (!/^audio\/missions\/mission-[a-z-]+-v\d+\.mp3$/.test(score.file ?? '')) throw new Error(`Invalid mission score path: ${track}`);
    const bytes = await readFile(join(root, score.file));
    if (bytes.length !== score.bytes || createHash('sha256').update(bytes).digest('hex') !== score.sha256) throw new Error(`Mission score integrity mismatch: ${track}`);
    const file = score.file.slice('audio/'.length);
    if (missionFiles.has(file)) throw new Error(`Duplicate mission score path: ${track} reuses ${file}`);
    missionFiles.add(file);
    files.push(file);
  }
  for (const [track, score] of Object.entries(storyScores)) {
    if (score.status !== 'generated') {
      if (options.requireStoryScores) throw new Error(`${track}: ElevenLabs score is still pending.`);
      warn(`${track}: pending ElevenLabs generation; existing hangar soundtrack is the declared temporary bed.`);
      continue;
    }
    if (!/^audio\/story\/[a-z-]+-v\d+\.mp3$/.test(score.file ?? '')) throw new Error(`Invalid story score path: ${track}`);
    const bytes = await readFile(join(root, score.file));
    if (bytes.length !== score.bytes || createHash('sha256').update(bytes).digest('hex') !== score.sha256) {
      throw new Error(`Story score integrity mismatch: ${track}`);
    }
    files.push(score.file.slice('audio/'.length));
  }

  const failures = [];
  const missionHashes = new Map();
  for (const file of files) {
    const path = join(root, 'audio', file);
    try {
      const signature = await readFile(path, { encoding: null });
      const hasMp3Header = signature.subarray(0, 3).toString('latin1') === 'ID3'
        || (signature[0] === 0xff && (signature[1] & 0xe0) === 0xe0);
      if (signature.length < 1_024) failures.push(`${path} is empty or truncated (${signature.length} bytes)`);
      if (!hasMp3Header) failures.push(`${path} does not have an MP3 header`);
      if (missionFiles.has(file)) {
        const hash = createHash('sha256').update(signature).digest('hex');
        const previous = missionHashes.get(hash);
        if (previous) failures.push(`${file} duplicates the music bytes of ${previous}; each mission needs a distinct score.`);
        missionHashes.set(hash, file);
      }
    } catch (error) {
      failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Required production soundtrack verification failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  }

  return { files, distinctMissionFiles: missionFiles.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'public';
  verifyAudio(root, {
    requireMissionScores: process.argv.includes('--require-mission-scores'),
    requireStoryScores: process.argv.includes('--require-story-scores'),
  }).then(({ files }) => {
    console.log(`Verified ${files.length} production soundtrack files in ${root}/audio.`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Soundtrack verification failed.');
    process.exitCode = 1;
  });
}
