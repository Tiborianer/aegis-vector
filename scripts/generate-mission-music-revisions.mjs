// Versioned candidates only. Never changes active src/audio/mission-scores.json.
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PLAN = 'docs/audio/mission-score-revisions-2026-11-08.json';
const BUDGET = 'docs/audio/production-budget-2026-11-08.json';
const RECORDS = 'assets/audio/mission-score-revisions-2026-11-08';
class WorkflowError extends Error {}
const fail = (message) => { throw new WorkflowError(message); };
export const revisionMusicErrorMessage = (error) => error instanceof WorkflowError ? error.message
  : 'Music revision workflow stopped. Details suppressed; inspect local receipts before any retry.';

export function parseRevisionMusicArgs(args) {
  const result = { action: 'dry-run', track: undefined };
  const seen = new Set();
  const actions = ['--generate', '--initialize-budget', '--check-access', '--dry-run', '--reconcile'];
  for (const arg of args) {
    const name = arg.split('=')[0];
    if (seen.has(name)) fail('Duplicate option; no request made.');
    seen.add(name);
    if (arg.startsWith('--track=')) result.track = arg.slice(8);
    else if (actions.includes(arg)) {
      if ([...seen].some((other) => other !== arg && actions.includes(other))) fail('Choose one action only.');
      result.action = arg.slice(2);
    } else fail('Unknown option. Use --dry-run, --check-access, --initialize-budget, --reconcile or --generate --track=mission-name.');
  }
  if (result.track !== undefined && !/^mission-[a-z-]+$/.test(result.track)) fail('Invalid track name.');
  if (result.action === 'generate' && !result.track) fail('Generate one named track at a time.');
  if (['initialize-budget', 'check-access', 'reconcile'].includes(result.action) && result.track) fail('Account actions do not accept a track.');
  return result;
}
async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function saveJson(path, value, exclusive = false) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', exclusive ? { flag: 'wx' } : undefined);
}
function validatePlan(plan) {
  if (plan.model_id !== 'music_v2_5' || plan.output_format !== 'mp3_44100_128' || typeof plan.commonPrompt !== 'string') fail('Invalid music plan.');
  for (const [track, spec] of Object.entries(plan.tracks)) {
    if (!/^mission-[a-z-]+$/.test(track) || !new RegExp(`^audio/missions/${track}-v[12]\\.mp3$`).test(spec.file)
      || !Number.isInteger(spec.music_length_ms) || ![180000, 210000].includes(spec.music_length_ms)
      || !Number.isInteger(spec.reservedCredits) || spec.reservedCredits < 6000 || spec.reservedCredits > 7500
      || typeof spec.direction !== 'string' || `${plan.commonPrompt}\n\n${spec.direction}`.length > 4100) fail('Invalid versioned track specification.');
    if (spec.priorFile && spec.file === spec.priorFile) fail('Replacement cannot overwrite the current score.');
  }
}
function assertBudget(budget) {
  if (!budget.authorizationApproved || budget.maximumCredits !== 50000 || !Array.isArray(budget.generations)) fail('Explicit 50000-credit revision authorization is missing.');
}
export async function runMusicRevisions({ args = [], root = ROOT, fetchImpl = globalThis.fetch, log = console.log,
  readCredential = async () => (await import('./elevenlabs-credentials.mjs')).readElevenLabsCredential(),
} = {}) {
  const { action, track } = parseRevisionMusicArgs(args);
  const plan = await readJson(join(root, PLAN)); validatePlan(plan);
  if (track && !Object.hasOwn(plan.tracks, track)) fail('Unknown mission track.');
  if (action === 'dry-run') {
    const selected = Object.entries(plan.tracks).filter(([name]) => !track || name === track);
    for (const [name, spec] of selected) log(`${name}: ${spec.music_length_ms / 1000}s to ${spec.file}; reserve ${spec.reservedCredits} credits. Dry run: no credential, network or writes.`);
    return selected.map(([name]) => ({ track: name, status: 'dry-run' }));
  }
  const budgetPath = join(root, BUDGET), budget = await readJson(budgetPath); assertBudget(budget);
  const recordsDir = join(root, RECORDS);
  const spec = track ? plan.tracks[track] : undefined;
  const versionName = spec?.file.split('/').at(-1).replace('.mp3', '');
  const destination = spec && join(root, 'public', spec.file);
  const requestPath = spec && join(recordsDir, `${versionName}.request.json`);
  const receiptPath = spec && join(recordsDir, `${versionName}.receipt.json`);
  if (action === 'generate') {
    for (const path of [destination, `${destination}.partial`, requestPath, receiptPath]) if (await exists(path)) fail('Existing candidate or request found; inspect it before any retry.');
    if (!Number.isInteger(budget.baselineUsedCredits) || !Number.isInteger(budget.baselineCreditLimit)) fail('Initialize the budget with a live account check first.');
    if (budget.activeRequest) fail('A request is unresolved; reconcile it before spending more credits.');
    if (budget.status !== 'ready') fail('Budget is not ready; review the recorded stop condition before generation.');
  }
  let reconciliation;
  if (action === 'reconcile') {
    const pending = budget.generations.at(-1);
    if (budget.status !== 'generation-in-progress' || !pending || pending.status !== 'request-started'
      || !budget.activeRequest || budget.activeRequest !== pending.versionName
      || !Object.hasOwn(plan.tracks, pending.track)
      || !Number.isInteger(budget.baselineUsedCredits) || !Number.isInteger(budget.baselineCreditLimit)
      || !Number.isInteger(budget.latestUsedCredits) || !Number.isInteger(pending.beforeUsed)
      || pending.beforeUsed < budget.baselineUsedCredits || pending.beforeUsed < budget.latestUsedCredits) {
      fail('No valid latest unresolved request to reconcile; ledger unchanged.');
    }
    const pendingSpec = plan.tracks[pending.track];
    const pendingVersion = pendingSpec.file.split('/').at(-1).replace('.mp3', '');
    if (pending.versionName !== pendingVersion || pending.reservedCredits !== pendingSpec.reservedCredits
      || pending.model !== plan.model_id || pending.requestedDurationSeconds !== pendingSpec.music_length_ms / 1000) {
      fail('Pending request does not match the approved plan; ledger unchanged.');
    }
    let receipt, original, bytes;
    try {
      receipt = await readJson(join(recordsDir, `${pendingVersion}.receipt.json`));
      original = await readJson(join(recordsDir, `${pendingVersion}.request.json`));
      const candidatePath = join(root, 'public', pendingSpec.file);
      const info = await lstat(candidatePath);
      if (!info.isFile() || info.size < 100000 || info.size > 30000000) throw new Error();
      bytes = await readFile(candidatePath);
    } catch { fail('Complete candidate, original request and receipt required; ledger unchanged.'); }
    const fields = ['track', 'versionName', 'requestedAt', 'requestedDurationSeconds', 'model', 'beforeUsed', 'reservedCredits'];
    if (original.status !== 'request-started' || receipt.status !== 'generated-awaiting-review'
      || receipt.file !== pendingSpec.file || fields.some((field) => original[field] !== pending[field] || receipt[field] !== pending[field])
      || receipt.bytes !== bytes.length || receipt.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
      fail('Candidate receipt or original request mismatch; ledger unchanged.');
    }
    reconciliation = { pending, pendingSpec, pendingVersion, receipt };
  }
  let key;
  try { key = await readCredential(); } catch { fail('Configured secure ElevenLabs credential unavailable; no request made.'); }
  if (typeof key !== 'string' || !key.trim() || /\s/.test(key)) fail('Configured credential is malformed; no request made.');
  const readUsage = async () => {
    let response;
    try { response = await fetchImpl('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(20000) }); }
    catch { fail('Read-only subscription check failed; no automatic retry.'); }
    if (!response.ok) fail(`Read-only subscription check returned HTTP ${response.status}; provider body suppressed. Update access before continuing.`);
    let d; try { d = await response.json(); } catch { fail('Account metering response invalid; stop before generation.'); }
    if (!Number.isInteger(d.character_count) || !Number.isInteger(d.character_limit) || d.character_count < 0 || d.character_limit < d.character_count) fail('Account metering is unavailable or invalid.');
    return { used: d.character_count, limit: d.character_limit, remaining: d.character_limit - d.character_count,
      resetAt: d.next_character_count_reset_unix ?? null, tier: d.tier,
      overageEnabled: d.max_credit_limit_extension !== undefined ? d.max_credit_limit_extension !== 0 : d.allowed_to_extend_character_limit === true };
  };
  const before = await readUsage();
  if (action === 'check-access') { log(JSON.stringify(before)); return before; }
  if (action === 'initialize-budget') {
    if (budget.baselineUsedCredits !== null || budget.generations.length || budget.activeRequest) fail('Budget already initialized or contains request history; baseline cannot be reset.');
    if (before.remaining < budget.maximumCredits) fail('Existing account balance is below the authorized cap; review before generation.');
    Object.assign(budget, { status: 'ready', baselineUsedCredits: before.used, baselineCreditLimit: before.limit,
      baselineResetAt: before.resetAt, latestUsedCredits: before.used, latestRemainingCredits: before.remaining,
      baselineTier: before.tier, overageEnabledAtBaseline: before.overageEnabled, initializedAt: new Date().toISOString(),
      limitation: 'Candidates remain inactive pending actual decoding and owner listening approval.' });
    await saveJson(budgetPath, budget); log(`Budget initialized from live usage ${before.used}; 50000 new credits authorized, ${before.remaining} existing account credits available.`);
    return { status: 'ready' };
  }
  if (before.resetAt !== budget.baselineResetAt || before.used < budget.baselineUsedCredits || before.used < budget.latestUsedCredits) fail('Billing period or usage counter changed; reconcile accounting before generation.');
  const used = before.used - budget.baselineUsedCredits;
  if (action === 'reconcile') {
    const { pending, pendingSpec, pendingVersion, receipt } = reconciliation;
    if (before.used <= pending.beforeUsed) fail('Usage is not settled above the original request baseline; ledger unchanged.');
    const actual = before.used - pending.beforeUsed;
    const evidence = { reconciledAt: new Date().toISOString(), action: 'read-only-metering-reconciliation',
      versionName: pendingVersion, beforeUsed: pending.beforeUsed, afterUsed: before.used,
      resetAt: before.resetAt, limit: before.limit, candidateSha256: receipt.sha256,
      note: 'Original candidate and receipt verified. All usage since request counted conservatively. No generation retried.' };
    // Retained exclusive evidence prevents two reconcilers from overwriting a
    // later generation with a stale ledger. A crash requires manual inspection.
    await saveJson(join(recordsDir, `${pendingVersion}.reconciled.json`), evidence, true);
    Object.assign(pending, { status: 'generated-awaiting-review', file: pendingSpec.file,
      afterUsed: before.used, observedCredits: actual, reconciliation: evidence });
    Object.assign(budget, { activeRequest: null, status: used > budget.maximumCredits ? 'stop-budget-exceeded'
      : actual > pendingSpec.reservedCredits ? 'stop-reservation-exceeded' : 'ready',
      latestUsedCredits: before.used, latestRemainingCredits: before.remaining, observedCreditsUsedThisPass: used,
      remainingAuthorizedCredits: budget.maximumCredits - used });
    await saveJson(budgetPath, budget);
    log(`${pendingVersion} reconciled without generation. Observed charge ${actual}; total ${used}/50000; status ${budget.status}.`);
    if (budget.status !== 'ready') fail('Observed charge exceeds the safety reservation or budget; stop and review before further spending.');
    return { track: pending.track, status: 'generated-awaiting-review', observedCredits: actual, reconciled: true };
  }
  if (used + spec.reservedCredits > budget.maximumCredits || before.remaining < spec.reservedCredits) fail('Insufficient authorized or existing-account headroom; no generation made.');
  await mkdir(recordsDir, { recursive: true });
  await mkdir(join(root, 'public/audio/missions'), { recursive: true });
  // A permanent exclusive ordinal claim prevents concurrent different-track
  // invocations from spending against the same ledger snapshot. It is retained.
  const ordinal = budget.generations.length + 1;
  await saveJson(join(recordsDir, `claim-${String(ordinal).padStart(2, '0')}.json`), { track, versionName, beforeUsed: before.used }, true);
  const requestedAt = new Date().toISOString();
  const request = { track, versionName, requestedAt, status: 'request-started', requestedDurationSeconds: spec.music_length_ms / 1000,
    model: plan.model_id, beforeUsed: before.used, reservedCredits: spec.reservedCredits };
  await saveJson(requestPath, request, true);
  budget.activeRequest = versionName; budget.status = 'generation-in-progress';
  budget.generations.push(request); await saveJson(budgetPath, budget);
  log(`Generating ${versionName}; one request, existing credits, no automatic retry.`);
  let response;
  try {
    response = await fetchImpl(`https://api.elevenlabs.io/v1/music?output_format=${plan.output_format}`, {
      method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: plan.model_id, prompt: `${plan.commonPrompt}\n\n${spec.direction}`,
        music_length_ms: spec.music_length_ms, force_instrumental: true }), signal: AbortSignal.timeout(600000),
    });
  } catch { fail(`Generation outcome uncertain for ${versionName}; request retained. Inspect provider history, do not retry.`); }
  if (!response.ok) fail(`Generation returned HTTP ${response.status}; provider body suppressed. Request retained; no automatic retry.`);
  let bytes;
  try { bytes = Buffer.from(await response.arrayBuffer()); } catch { fail('Audio transfer incomplete. Request retained; do not regenerate.'); }
  if (!(bytes.subarray(0, 3).toString('latin1') === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224))
    || bytes.length < 100000 || bytes.length > 30000000) fail('Response is not a plausible MP3; request retained, do not regenerate.');
  await writeFile(destination, bytes, { flag: 'wx' });
  const receipt = { ...request, file: spec.file, priorFile: spec.priorFile, status: 'generated-awaiting-review',
    generatedAt: new Date().toISOString(), songId: response.headers.get('song-id'), bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    review: 'Not active. Requires full decoding, measured duration, loop check and owner listening approval.' };
  await saveJson(receiptPath, receipt, true);
  const after = await readUsage();
  if (after.resetAt !== budget.baselineResetAt || after.used <= before.used) fail('Candidate saved but usage is not settled; reconcile accounting before further generation.');
  const actual = after.used - before.used, total = after.used - budget.baselineUsedCredits;
  Object.assign(budget.generations.at(-1), { status: 'generated-awaiting-review', file: spec.file, afterUsed: after.used, observedCredits: actual });
  Object.assign(budget, { activeRequest: null, status: total > budget.maximumCredits ? 'stop-budget-exceeded'
    : actual > spec.reservedCredits ? 'stop-reservation-exceeded' : 'ready',
    latestUsedCredits: after.used, latestRemainingCredits: after.remaining, observedCreditsUsedThisPass: total,
    remainingAuthorizedCredits: budget.maximumCredits - total });
  await saveJson(budgetPath, budget);
  log(`${versionName} saved inactive. Charge ${actual}; total ${total}/50000; remaining authorization ${budget.maximumCredits - total}.`);
  if (total > budget.maximumCredits || actual > spec.reservedCredits) fail('Observed charge exceeds the safety reservation; stop and review before further spending.');
  return { track, status: 'generated-awaiting-review', observedCredits: actual };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runMusicRevisions({ args: process.argv.slice(2) }).catch((error) => { console.error(revisionMusicErrorMessage(error)); process.exitCode = 1; });
}
