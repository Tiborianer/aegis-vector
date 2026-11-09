// Explicit, single-track, resumable ElevenLabs production. Dry run never calls the API.
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
class WorkflowError extends Error {}
const fail = (message) => { throw new WorkflowError(message); };

export function parseMissionMusicArgs(args) {
  const options = { live: false, selected: undefined };
  const seen = new Set();
  for (const arg of args) {
    const name = arg.split('=')[0];
    if (seen.has(name)) fail('Duplicate option; no request made.');
    seen.add(name);
    if (arg === '--generate') options.live = true;
    else if (arg === '--dry-run') continue;
    else if (arg.startsWith('--track=')) options.selected = arg.slice(8);
    else fail('Unknown option. Use --track and optionally --generate.');
  }
  if (options.live && seen.has('--dry-run')) fail('Choose dry run or generation, not both.');
  if (options.selected !== undefined && !/^mission-[a-z-]+$/.test(options.selected)) fail('Invalid mission track.');
  if (options.live && !options.selected) fail('Generate one named --track at a time, after confirming available credits.');
  return options;
}

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function missionMusicErrorMessage(error) {
  return error instanceof WorkflowError ? error.message : 'Mission music workflow stopped. No automatic retry; inspect local outputs and receipts.';
}

export async function runMissionMusic({
  args = [], root = ROOT, fetchImpl = globalThis.fetch, log = console.log,
  readCredential = async () => (await import('./elevenlabs-credentials.mjs')).readElevenLabsCredential(),
} = {}) {
  const { live, selected } = parseMissionMusicArgs(args);
  const plan = JSON.parse(await readFile(join(root, 'docs/audio/mission-score-prompts.json'), 'utf8'));
  const manifestPath = join(root, 'src/audio/mission-scores.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (selected && !Object.hasOwn(plan.tracks, selected)) fail('Unknown mission track.');
  if (plan.model_id !== 'music_v2_5' || plan.output_format !== 'mp3_44100_128' || typeof plan.commonPrompt !== 'string') {
    fail('Mission score plan model, format or common prompt is invalid; review before generation.');
  }
  const results = [];
  for (const [track, spec] of Object.entries(plan.tracks)) {
    if (selected && selected !== track) continue;
    if (!/^mission-[a-z-]+$/.test(track)) fail('Invalid mission track in plan.');
    if (['generated', 'reviewed'].includes(manifest[track]?.status)) {
      log(`${track}: already generated; skipping without API use.`);
      results.push({ track, status: 'skipped' });
      continue;
    }
    const prompt = `${plan.commonPrompt}\n\n${spec.direction}`;
    if (typeof spec.direction !== 'string' || prompt.length > 4100) fail('Music prompt is invalid or exceeds the documented character limit.');
    if (!/^audio\/missions\/mission-[a-z-]+-v\d+\.mp3$/.test(spec.file)) fail('Invalid shipping path.');
    if (!/^audio\/[a-z-]+\.mp3$/.test(spec.fallback)) fail('Invalid fallback path.');
    if (!Number.isInteger(spec.music_length_ms) || spec.music_length_ms < 3_000 || spec.music_length_ms > 600_000) fail('Invalid music duration.');
    if (!live) {
      log(`${track}: ${spec.music_length_ms / 1000}s, ${plan.model_id}, ${prompt.length} prompt characters. Dry run; no credential read, network request, writes, or credits used.`);
      results.push({ track, status: 'dry-run' });
      continue;
    }
    const destination = join(root, 'public', spec.file);
    const directory = join(root, 'assets/audio/mission-scores');
    const pending = join(directory, `${track}.request.json`);
    const receiptPath = join(directory, `${track}.receipt.json`);
    // A request receipt survives HTTP failures, incomplete transfers and malformed
    // successes. Even a broken symlink counts as an existing protected target.
    for (const path of [destination, `${destination}.partial`, pending, receiptPath]) {
      if (await exists(path)) fail(`An output or pending request exists for ${track}. Inspect provider history before any retry.`);
    }
    let key;
    try { key = await readCredential(); }
    catch { fail('Credential unavailable or invalid; no request made. Configure the shared secure credential helper.'); }
    if (typeof key !== 'string' || !key.trim() || /\s/.test(key)) fail('Credential unavailable or invalid; no request made.');
    await mkdir(join(root, 'public/audio/missions'), { recursive: true });
    await mkdir(directory, { recursive: true });
    const requestedAt = new Date().toISOString();
    await writeFile(pending, `${JSON.stringify({ track, requestedAt, status: 'request-started', model: plan.model_id, requestedDurationSeconds: spec.music_length_ms / 1000 })}\n`, { flag: 'wx' });
    log(`Generating ${track}; consumes existing ElevenLabs credits. No automatic retry.`);
    let response;
    try {
      response = await fetchImpl(`https://api.elevenlabs.io/v1/music?output_format=${encodeURIComponent(plan.output_format)}`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: plan.model_id, prompt, music_length_ms: spec.music_length_ms, force_instrumental: true }),
        signal: AbortSignal.timeout(600_000),
      });
    } catch { fail(`Request outcome uncertain for ${track}. Check ElevenLabs history; do not retry automatically.`); }
    if (!response.ok) fail(`ElevenLabs HTTP ${response.status}. Check access/credits before retrying; provider body suppressed.`);
    let bytes;
    try { bytes = Buffer.from(await response.arrayBuffer()); }
    catch { fail(`Response transfer incomplete for ${track}. Receipt retained; inspect provider history, do not regenerate automatically.`); }
    const mp3 = bytes.subarray(0, 3).toString('latin1') === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    if (!mp3 || bytes.length < 100_000 || bytes.length > 30_000_000) fail('Response is not a plausible non-empty MP3; receipt retained, inspect request history.');
    // No rename-overwrite window: the final output is exclusive too. Generated
    // audio remains inactive until a separate decode/listening review approves it.
    await writeFile(destination, bytes, { flag: 'wx' });
    const score = {
      file: spec.file, fallback: spec.fallback, status: 'generated', provider: 'ElevenLabs',
      model: plan.model_id, generatedAt: new Date().toISOString(), requestedDurationSeconds: spec.music_length_ms / 1000,
      songId: response.headers.get('song-id'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      review: 'pending decode, measured duration and listening review',
    };
    await writeFile(receiptPath, `${JSON.stringify({ track, requestedAt, ...score }, null, 2)}\n`, { flag: 'wx' });
    // Re-read so unrelated edits made during a long generation are retained.
    // Invoke tracks serially; receipts are the recovery source if interrupted.
    const latestManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    latestManifest[track] = score;
    await writeFile(manifestPath, `${JSON.stringify(latestManifest, null, 2)}\n`);
    log(`${track}: saved. Decode, measure and audition before marking this score reviewed.`);
    results.push({ track, status: 'generated' });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runMissionMusic({ args: process.argv.slice(2) }).catch((error) => {
    console.error(missionMusicErrorMessage(error));
    process.exitCode = 1;
  });
}
