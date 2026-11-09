// Preparation defaults to dry run. Never call this with --generate before owner approval.
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PHRASES = Object.freeze({ 'arc-upgraded': 'Arc cannon upgraded.', 'ion-upgraded': 'Ion conductor upgraded.' });
const ION_RETAKE = Object.freeze({ cue: 'ion-upgraded', phrase: 'Eye-on conductor upgraded.', version: 4, noiseSeed: 7205 });
const SETTINGS = Object.freeze({ stability: .7, similarity_boost: .75, style: 0, use_speaker_boost: true, speed: 1 });
class WorkflowError extends Error {}
const fail = (message) => { throw new WorkflowError(message); };

export function parseRadioCorrectionArgs(args) {
  const options = { generate: false, cue: undefined, voiceId: undefined, take: undefined };
  const seen = new Set();
  for (const arg of args) {
    const name = arg.split('=')[0];
    if (seen.has(name)) fail('Duplicate option; no request made.');
    seen.add(name);
    if (arg === '--generate') options.generate = true;
    else if (arg === '--dry-run') continue;
    else if (arg.startsWith('--cue=')) options.cue = arg.slice(6);
    else if (arg.startsWith('--voice-id=')) options.voiceId = arg.slice(11);
    else if (arg.startsWith('--take=')) options.take = arg.slice(7);
    else fail('Unknown option. Use --cue, --voice-id, optionally --take=ion-v4 and --generate.');
  }
  if (seen.has('--dry-run') && options.generate) fail('Choose dry run or generation, not both.');
  if (options.cue !== undefined && !Object.hasOwn(PHRASES, options.cue)) fail('Unknown correction cue.');
  if (options.take !== undefined && (options.take !== 'ion-v4' || options.cue !== ION_RETAKE.cue)) fail('The only explicit retake is --take=ion-v4 with --cue=ion-upgraded.');
  if (options.voiceId !== undefined && !/^[A-Za-z0-9_-]{10,128}$/.test(options.voiceId)) fail('Supply a valid observed Sarah voice ID, not a URL or credential.');
  if (options.generate && (!options.cue || !options.voiceId)) fail('Live generation requires one --cue and its observed Sarah --voice-id.');
  return options;
}

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function runRadioCorrections({
  args = [], root = ROOT, fetchImpl = globalThis.fetch, log = console.log,
  readCredential = async () => (await import('./elevenlabs-credentials.mjs')).readElevenLabsCredential(),
} = {}) {
  const options = parseRadioCorrectionArgs(args);
  const plan = JSON.parse(await readFile(join(root, 'docs/audio/radio-corrections-plan.json'), 'utf8'));
  if (plan.model_id !== 'eleven_multilingual_v2' || plan.output_format !== 'mp3_44100_128'
    || Object.keys(plan.cues ?? {}).length !== 2
    || Object.keys(plan.voice_settings ?? {}).length !== Object.keys(SETTINGS).length
    || Object.entries(SETTINGS).some(([key, value]) => plan.voice_settings[key] !== value)
    || Object.entries(PHRASES).some(([cue, phrase]) => plan.cues[cue]?.phrase !== phrase)) {
    fail('Correction plan differs from the bounded two-cue Sarah v2 workflow; review before proceeding.');
  }
  if (options.take && (Object.keys(plan.retakes?.[options.take] ?? {}).length !== Object.keys(ION_RETAKE).length
    || Object.entries(ION_RETAKE).some(([key, value]) => plan.retakes?.[options.take]?.[key] !== value))) {
    fail('Ion v4 retake plan differs from the approved bounded pronunciation correction.');
  }
  const results = [];
  for (const cue of Object.keys(PHRASES).filter((cue) => !options.cue || cue === options.cue)) {
    const version = options.take ? ION_RETAKE.version : 3;
    const phrase = options.take ? ION_RETAKE.phrase : PHRASES[cue];
    const sourceRelative = `assets/audio/voice-v${version}/${cue}.mp3`;
    const directory = join(root, `assets/audio/voice-v${version}`);
    const source = join(root, sourceRelative);
    const requestPath = join(directory, `${cue}.request.json`);
    const receiptPath = join(directory, `${cue}.receipt.json`);
    const guards = [source, `${source}.partial`, requestPath, receiptPath,
      join(directory, 'raw', `${cue}.wav`), join(directory, `${cue}.processing.request.json`),
      join(directory, `${cue}.processing.receipt.json`), join(root, `public/audio/voice-v${version}`, `${cue}.wav`)];
    if ((await Promise.all(guards.map(exists))).some(Boolean)) {
      log(`${cue}: existing output or receipt; skipped without credential access or API use. Review history manually if the prior outcome is uncertain.`);
      results.push({ cue, status: 'skipped' });
      continue;
    }
    if (!options.generate) {
      log(`${cue}: "${phrase}"; Sarah / Multilingual v2 / voice-v${version}. Dry run: no credential read, network request, writes, or credits used.`);
      results.push({ cue, status: 'dry-run' });
      continue;
    }
    let key;
    try { key = await readCredential(); }
    catch { fail('Credential unavailable or invalid; no request made. Configure the shared secure credential helper.'); }
    if (typeof key !== 'string' || !key.trim() || /\s/.test(key)) fail('Credential unavailable or invalid; no request made.');
    const body = { text: phrase, model_id: plan.model_id, voice_settings: { ...SETTINGS } };
    await mkdir(directory, { recursive: true });
    const request = {
      cue, status: 'request-started', requestedAt: new Date().toISOString(), provider: 'ElevenLabs',
      ...(options.take ? { take: options.take } : {}),
      voiceId: options.voiceId, voiceLabel: plan.voiceLabel, outputFormat: plan.output_format,
      request: body, source: sourceRelative, review: 'Not generated or reviewed yet; inspect provider history if interrupted.',
    };
    // Exclusive request marker prevents concurrent calls and blind retries.
    await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { flag: 'wx' });
    log(`${cue}: requesting one correction using existing credits. No automatic retry.`);
    let response;
    try {
      response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(options.voiceId)}?output_format=${plan.output_format}`, {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
      });
    } catch { fail('Request outcome uncertain. Receipt retained; inspect ElevenLabs history before any manual recovery.'); }
    if (!response.ok) fail(`ElevenLabs HTTP ${response.status}; provider body suppressed. Receipt retained; do not automatically retry.`);
    let bytes;
    try { bytes = Buffer.from(await response.arrayBuffer()); }
    catch { fail('Response transfer incomplete. Receipt retained; inspect provider history, do not regenerate automatically.'); }
    const mp3 = bytes.subarray(0, 3).toString('latin1') === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    if (!mp3 || bytes.length < 1_024 || bytes.length > 2_000_000) fail('Response is not a plausible short MP3. Receipt retained; inspect provider history.');
    await writeFile(source, bytes, { flag: 'wx' });
    const receipt = {
      ...request, status: 'source-saved', savedAt: new Date().toISOString(),
      bytes: bytes.length, sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      review: 'Pending offline decode, radio processing, complete audition and runtime mapping. Credits charged not independently measured.',
    };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
    log(`${cue}: source saved without changing prior versions. Next: python scripts/prepare-radio-corrections.py --prepare --cue=${cue}${options.take ? ` --take=${options.take}` : ''}`);
    results.push({ cue, status: 'source-saved' });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runRadioCorrections({ args: process.argv.slice(2) }).catch((error) => {
    // Never echo arbitrary provider, fetch, filesystem, or credential error messages.
    console.error(error instanceof WorkflowError ? error.message : 'Radio correction workflow stopped. No automatic retry; inspect local outputs and receipts.');
    process.exitCode = 1;
  });
}
