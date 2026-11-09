// One approved ECHO-7 line, versioned and non-overwriting. Dry run by default.
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIRECTORY = 'assets/audio/voice-v5';
const SETTINGS = Object.freeze({ stability: .8, similarity_boost: .75, style: 0, use_speaker_boost: true, speed: 1 });
const VOICE_ID = 'Xb7hH8MSUJpSbSDYk0k2';
class WorkflowError extends Error {}
const fail = (message) => { throw new WorkflowError(message); };
export const shieldHitErrorMessage = (error) => error instanceof WorkflowError ? error.message : 'Shield Hit workflow stopped. Details suppressed; preserve receipts and inspect locally before any retry.';
async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const save = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });

export async function runShieldHit({ args = [], root = ROOT, fetchImpl = globalThis.fetch, log = console.log,
  readCredential = async () => (await import('./elevenlabs-credentials.mjs')).readElevenLabsCredential(),
} = {}) {
  if (args.length > 1 || (args.length === 1 && !['--dry-run', '--generate', '--reconcile'].includes(args[0]))) fail('Choose one action: --dry-run, --generate or --reconcile.');
  const action = args[0] ?? '--dry-run';
  const plan = JSON.parse(await readFile(join(root, 'docs/audio/shield-hit-v5-plan.json'), 'utf8'));
  if (plan.cue !== 'shield-hit' || plan.phrase !== 'Shield hit.' || plan.speaker !== 'ECHO-7'
    || plan.voiceId !== VOICE_ID || plan.voiceLabel !== 'Alice - Clear, Engaging Educator'
    || plan.model_id !== 'eleven_multilingual_v2' || plan.output_format !== 'mp3_44100_128'
    || plan.maximumCredits !== 200 || plan.authorizationApproved !== true
    || plan.source !== `${DIRECTORY}/shield-hit.mp3` || plan.file !== 'audio/voice-v5/shield-hit.wav'
    || plan.version !== 5 || plan.noiseSeed !== 7105
    || Object.keys(plan.voice_settings ?? {}).length !== Object.keys(SETTINGS).length
    || Object.entries(SETTINGS).some(([key, value]) => plan.voice_settings[key] !== value)) fail('Shield Hit plan differs from the bounded, approved ECHO-7 workflow.');
  if (action === '--dry-run') {
    log('shield-hit: "Shield hit."; Alice / Multilingual v2 / voice-v5. Dry run: no credentials, network, writes or credits.');
    return { status: 'dry-run' };
  }
  const directory = join(root, DIRECTORY), source = join(root, plan.source);
  const requestPath = join(directory, 'shield-hit.request.json'), receiptPath = join(directory, 'shield-hit.receipt.json');
  const meteringPath = join(directory, 'shield-hit.metering.json');
  let receipt;
  if (action === '--generate') {
    const guards = [source, `${source}.partial`, requestPath, receiptPath, meteringPath,
      join(directory, 'raw/shield-hit.wav'), join(directory, 'shield-hit.processing.request.json'),
      join(directory, 'shield-hit.processing.receipt.json'), join(root, 'public', plan.file)];
    if ((await Promise.all(guards.map(exists))).some(Boolean)) {
      log('shield-hit: prior source, request or processing evidence exists; no credential access or retry.');
      return { status: 'skipped' };
    }
  } else {
    if (await exists(meteringPath)) fail('Metering already recorded; no changes made.');
    try {
      receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      const original = JSON.parse(await readFile(requestPath, 'utf8'));
      const info = await lstat(source), bytes = await readFile(source);
      if (!info.isFile() || receipt.status !== 'source-saved' || receipt.sourceSha256 !== digest(bytes)
        || receipt.bytes !== bytes.length || receipt.cue !== 'shield-hit' || receipt.voiceId !== VOICE_ID
        || receipt.request?.text !== plan.phrase || receipt.source !== plan.source
        || original.request?.text !== plan.phrase || original.before?.used !== receipt.before?.used
        || original.before?.resetAt !== receipt.before?.resetAt) throw new Error();
    } catch { fail('Complete matching source, request and receipt required for read-only reconciliation.'); }
  }
  let key;
  try { key = await readCredential(); } catch { fail('Secure ElevenLabs credential unavailable; no provider request made.'); }
  if (typeof key !== 'string' || !key.trim() || /\s/.test(key)) fail('Configured credential invalid; no provider request made.');
  const readUsage = async () => {
    let response;
    try { response = await fetchImpl('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(20000) }); }
    catch { fail('Read-only balance check failed; no automatic retry.'); }
    if (!response.ok) fail(`Read-only balance check returned HTTP ${response.status}; provider body suppressed.`);
    let data; try { data = await response.json(); } catch { fail('Invalid balance response; generation stopped.'); }
    if (!Number.isInteger(data.character_count) || !Number.isInteger(data.character_limit)
      || data.character_count < 0 || data.character_limit < data.character_count
      || !Number.isInteger(data.next_character_count_reset_unix)) fail('Credit metering unavailable; generation stopped.');
    return { used: data.character_count, limit: data.character_limit, resetAt: data.next_character_count_reset_unix, tier: data.tier };
  };
  const recordMetering = async (before, after) => {
    if (before.resetAt !== after.resetAt || after.used <= before.used) fail('Source saved but metering is not settled; use --reconcile later. Never regenerate.');
    const credits = after.used - before.used;
    await save(meteringPath, { cue: 'shield-hit', before, after, observedCredits: credits, maximumCredits: 200,
      measuredAt: new Date().toISOString(), status: credits <= 200 ? 'within-budget' : 'stop-budget-exceeded',
      note: 'All observed account usage since request conservatively counted. No automatic generation retry.' });
    if (credits > 200) fail('Observed usage exceeds the 200-credit cap; stop and review. No further generation.');
    log(`shield-hit: observed usage ${credits}/200 credits; source retained.`);
    return { status: 'source-saved', observedCredits: credits };
  };
  const before = await readUsage();
  if (action === '--reconcile') return recordMetering(receipt.before, before);
  if (before.limit - before.used < 200) fail('Existing balance is below the 200-credit safety reservation; no generation.');
  const request = { cue: 'shield-hit', speaker: 'ECHO-7', provider: 'ElevenLabs', voiceId: VOICE_ID,
    voiceLabel: plan.voiceLabel, requestedAt: new Date().toISOString(), status: 'request-started',
    maximumCredits: 200, before, source: plan.source, outputFormat: plan.output_format,
    request: { text: plan.phrase, model_id: plan.model_id, voice_settings: { ...SETTINGS } } };
  await mkdir(directory, { recursive: true });
  await save(requestPath, request); // Exclusive permanent marker blocks concurrent calls and unsafe retries.
  log('shield-hit: requesting one approved Alice line using existing credits; no automatic retry.');
  let response;
  try { response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${plan.output_format}`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(request.request), signal: AbortSignal.timeout(90000),
  }); } catch { fail('Generation outcome uncertain; preserve request marker and inspect provider history. Do not regenerate.'); }
  if (!response.ok) fail(`ElevenLabs HTTP ${response.status}; provider body suppressed. Request retained; do not retry automatically.`);
  let bytes; try { bytes = Buffer.from(await response.arrayBuffer()); }
  catch { fail('Audio transfer incomplete; preserve request and inspect provider history. Do not regenerate.'); }
  if (!(bytes.subarray(0, 3).toString('latin1') === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224))
    || bytes.length < 1024 || bytes.length > 2000000) fail('Invalid short MP3 response; request retained. Do not regenerate.');
  await writeFile(source, bytes, { flag: 'wx' });
  receipt = { ...request, status: 'source-saved', savedAt: new Date().toISOString(), bytes: bytes.length,
    sourceSha256: digest(bytes), review: 'Pending full decode, offline production processing, audition and runtime verification.' };
  await save(receiptPath, receipt);
  return recordMetering(before, await readUsage());
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runShieldHit({ args: process.argv.slice(2) }).catch((error) => { console.error(shieldHitErrorMessage(error)); process.exitCode = 1; });
}
