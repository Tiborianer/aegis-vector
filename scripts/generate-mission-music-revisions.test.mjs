import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRevisionMusicArgs, revisionMusicErrorMessage, runMusicRevisions } from './generate-mission-music-revisions.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const planPath = 'docs/audio/mission-score-revisions-2026-11-08.json';
const budgetPath = 'docs/audio/production-budget-2026-11-08.json';
const ARGS = ['--generate', '--track=mission-stormbreak'];
const SECRET = 'fake-secret-never-display';
async function fixture(initialized = true) {
  const root = await mkdtemp(join(tmpdir(), 'aegis-music-revision-test-'));
  await mkdir(join(root, 'docs/audio'), { recursive: true });
  await mkdir(join(root, 'src/audio'), { recursive: true });
  const plan = JSON.parse(await readFile(join(ROOT, planPath), 'utf8'));
  const budget = { authorizationApproved: true, maximumCredits: 50000, baselineUsedCredits: initialized ? 1000 : null,
    baselineCreditLimit: initialized ? 100000 : null, baselineResetAt: initialized ? 5000000000 : null,
    latestUsedCredits: initialized ? 1000 : null, generations: [], status: initialized ? 'ready' : 'awaiting-secure-credential' };
  await writeFile(join(root, planPath), JSON.stringify(plan));
  await writeFile(join(root, budgetPath), JSON.stringify(budget));
  await writeFile(join(root, 'src/audio/mission-scores.json'), 'active-v1-must-not-change');
  let used = 1000;
  const fetchImpl = vi.fn(async (_url, options) => {
    if (options?.method === 'POST') {
      used += 4773;
      return { ok: true, arrayBuffer: async () => Buffer.concat([Buffer.from('ID3'), Buffer.alloc(100000, 1)]), headers: new Headers({ 'song-id': 'fake-song' }) };
    }
    return { ok: true, json: async () => ({ character_count: used, character_limit: 100000, tier: 'creator', max_credit_limit_extension: 0, next_character_count_reset_unix: 5000000000 }) };
  });
  return { root, plan, budget, fetchImpl, log: vi.fn(), readCredential: vi.fn(async () => SECRET) };
}
const paidCalls = (deps) => deps.fetchImpl.mock.calls.filter(([, opts]) => opts?.method === 'POST');
async function unsettledFixture() {
  const deps = await fixture();
  const ordinary = deps.fetchImpl.getMockImplementation();
  let posted = false;
  deps.fetchImpl.mockImplementation(async (url, options) => {
    if (options?.method === 'POST') { posted = true; return ordinary(url, options); }
    if (posted) return { ok: true, json: async () => ({ character_count: 1000, character_limit: 100000, next_character_count_reset_unix: 5000000000 }) };
    return ordinary(url, options);
  });
  await expect(runMusicRevisions({ ...deps, args: ARGS })).rejects.toThrow('usage is not settled');
  deps.fetchImpl.mockClear().mockImplementation(ordinary);
  deps.readCredential.mockClear();
  deps.receiptPath = join(deps.root, 'assets/audio/mission-score-revisions-2026-11-08/mission-stormbreak-v2.receipt.json');
  deps.requestPath = deps.receiptPath.replace('.receipt.json', '.request.json');
  deps.candidatePath = join(deps.root, 'public/audio/missions/mission-stormbreak-v2.mp3');
  return deps;
}
describe('versioned music revision production safety', () => {
  it('dry runs six tracks without credentials, network or output writes', async () => {
    const deps = await fixture();
    const result = await runMusicRevisions(deps);
    expect(result).toHaveLength(6);
    expect(deps.readCredential).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(await readdir(deps.root)).toEqual(['docs', 'src']);
  });
  it('requires one unambiguous explicit track for spending', () => {
    for (const args of [['--generate'], [...ARGS, '--dry-run'], ['--track=../../key'], [...ARGS, '--track=mission-aurora'], ['--force'],
      ['--reconcile', '--track=mission-stormbreak'], ['--reconcile', '--generate']]) {
      expect(() => parseRevisionMusicArgs(args)).toThrow();
    }
  });
  it('initializes an unrepeatable baseline only from a live sanitized account read', async () => {
    const deps = await fixture(false);
    await runMusicRevisions({ ...deps, args: ['--initialize-budget'] });
    const budget = JSON.parse(await readFile(join(deps.root, budgetPath), 'utf8'));
    expect(budget).toMatchObject({ baselineUsedCredits: 1000, baselineCreditLimit: 100000, overageEnabledAtBaseline: false, status: 'ready' });
    expect(paidCalls(deps)).toHaveLength(0);
    await expect(runMusicRevisions({ ...deps, args: ['--initialize-budget'] })).rejects.toThrow('baseline cannot be reset');
  });
  it('refuses missing credentials, an uninitialized budget or insufficient headroom without a paid request', async () => {
    const noBudget = await fixture(false);
    await expect(runMusicRevisions({ ...noBudget, args: ARGS })).rejects.toThrow('Initialize the budget');
    expect(noBudget.readCredential).not.toHaveBeenCalled();
    const noKey = await fixture(); noKey.readCredential.mockRejectedValue(new Error(SECRET));
    await expect(runMusicRevisions({ ...noKey, args: ARGS })).rejects.toThrow('secure ElevenLabs credential unavailable');
    expect(noKey.fetchImpl).not.toHaveBeenCalled();
    const noHeadroom = await fixture();
    noHeadroom.budget.baselineUsedCredits = 0;
    noHeadroom.fetchImpl.mockResolvedValue({ ok: true, json: async () => ({ character_count: 45000, character_limit: 100000, next_character_count_reset_unix: 5000000000 }) });
    await writeFile(join(noHeadroom.root, budgetPath), JSON.stringify(noHeadroom.budget));
    await expect(runMusicRevisions({ ...noHeadroom, args: ARGS })).rejects.toThrow('Insufficient authorized');
    expect(paidCalls(noHeadroom)).toHaveLength(0);
  });
  it('creates only a versioned inactive candidate and accounts for actual usage, preserving the active manifest', async () => {
    const deps = await fixture();
    expect(await runMusicRevisions({ ...deps, args: ARGS })).toMatchObject({ status: 'generated-awaiting-review', observedCredits: 4773 });
    expect(paidCalls(deps)).toHaveLength(1);
    const body = JSON.parse(paidCalls(deps)[0][1].body);
    expect(body).toMatchObject({ model_id: 'music_v2_5', music_length_ms: 180000, force_instrumental: true });
    expect(body.prompt).toContain('not an arpeggiator jam');
    expect(await readFile(join(deps.root, 'src/audio/mission-scores.json'), 'utf8')).toBe('active-v1-must-not-change');
    const budget = JSON.parse(await readFile(join(deps.root, budgetPath), 'utf8'));
    expect(budget).toMatchObject({ observedCreditsUsedThisPass: 4773, remainingAuthorizedCredits: 45227, activeRequest: null, status: 'ready' });
    const receipt = await readFile(join(deps.root, 'assets/audio/mission-score-revisions-2026-11-08/mission-stormbreak-v2.receipt.json'), 'utf8');
    expect(receipt).not.toContain(SECRET);
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain(SECRET);
    await expect(runMusicRevisions({ ...deps, args: ARGS })).rejects.toThrow('Existing candidate');
    expect(paidCalls(deps)).toHaveLength(1);
  });
  it('retains unresolved requests and blocks further spending after uncertain outcomes', async () => {
    const deps = await fixture();
    const ordinary = deps.fetchImpl.getMockImplementation();
    deps.fetchImpl.mockImplementation(async (url, options) => {
      if (options?.method === 'POST') throw new Error(SECRET);
      return ordinary(url, options);
    });
    await expect(runMusicRevisions({ ...deps, args: ARGS })).rejects.toThrow('outcome uncertain');
    await expect(runMusicRevisions({ ...deps, args: ['--generate', '--track=mission-aurora'] })).rejects.toThrow('request is unresolved');
    expect(paidCalls(deps)).toHaveLength(1);
    expect(revisionMusicErrorMessage(new Error(SECRET))).not.toContain(SECRET);
  });
  it('suppresses provider errors and stops before generation on an access failure', async () => {
    const deps = await fixture(); const body = vi.fn(async () => SECRET);
    deps.fetchImpl.mockResolvedValue({ ok: false, status: 401, text: body, json: body });
    await expect(runMusicRevisions({ ...deps, args: ARGS })).rejects.toThrow('HTTP 401');
    expect(body).not.toHaveBeenCalled(); expect(paidCalls(deps)).toHaveLength(0);
  });
  it('serializes concurrent different-track spending through an exclusive ordinal claim', async () => {
    const deps = await fixture();
    const results = await Promise.allSettled([
      runMusicRevisions({ ...deps, args: ARGS }),
      runMusicRevisions({ ...deps, args: ['--generate', '--track=mission-aurora'] }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(paidCalls(deps)).toHaveLength(1);
  });
  it('explicitly reconciles only a verified saved candidate using one read-only account check', async () => {
    const deps = await unsettledFixture();
    const originalReceipt = await readFile(deps.receiptPath, 'utf8');
    expect(await runMusicRevisions({ ...deps, args: ['--reconcile'] })).toMatchObject({ reconciled: true, observedCredits: 4773 });
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    expect(paidCalls(deps)).toHaveLength(0);
    const ledger = JSON.parse(await readFile(join(deps.root, budgetPath), 'utf8'));
    expect(ledger).toMatchObject({ status: 'ready', activeRequest: null, observedCreditsUsedThisPass: 4773, remainingAuthorizedCredits: 45227 });
    expect(ledger.generations).toHaveLength(1);
    expect(ledger.generations[0]).toMatchObject({ status: 'generated-awaiting-review', afterUsed: 5773, observedCredits: 4773,
      reconciliation: { action: 'read-only-metering-reconciliation', beforeUsed: 1000, afterUsed: 5773 } });
    expect(await readFile(deps.receiptPath, 'utf8')).toBe(originalReceipt);
    expect(await readFile(join(deps.root, 'src/audio/mission-scores.json'), 'utf8')).toBe('active-v1-must-not-change');
    const reconciledLedger = await readFile(join(deps.root, budgetPath), 'utf8');
    await expect(runMusicRevisions({ ...deps, args: ['--reconcile'] })).rejects.toThrow('No valid latest unresolved');
    expect(await readFile(join(deps.root, budgetPath), 'utf8')).toBe(reconciledLedger);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('rejects mismatched or incomplete reconciliation evidence before reading credentials or usage', async () => {
    const mutations = [
      async (d) => writeFile(d.receiptPath, '{}'),
      async (d) => writeFile(d.requestPath, '{}'),
      async (d) => writeFile(d.candidatePath, Buffer.concat([Buffer.from('ID3'), Buffer.alloc(100000, 2)])),
      async (d) => { const ledger = JSON.parse(await readFile(join(d.root, budgetPath), 'utf8')); ledger.activeRequest = '../../unrelated'; await writeFile(join(d.root, budgetPath), JSON.stringify(ledger)); },
      async (d) => { const receipt = JSON.parse(await readFile(d.receiptPath, 'utf8')); receipt.beforeUsed += 1; await writeFile(d.receiptPath, JSON.stringify(receipt)); },
      async (d) => { const receipt = JSON.parse(await readFile(d.receiptPath, 'utf8')); receipt.file = '../../unrelated'; await writeFile(d.receiptPath, JSON.stringify(receipt)); },
      async (d) => { const receipt = JSON.parse(await readFile(d.receiptPath, 'utf8')); receipt.status = 'request-started'; await writeFile(d.receiptPath, JSON.stringify(receipt)); },
    ];
    for (const mutate of mutations) {
      const deps = await unsettledFixture(); await mutate(deps);
      const before = await readFile(join(deps.root, budgetPath), 'utf8');
      await expect(runMusicRevisions({ ...deps, args: ['--reconcile'] })).rejects.toThrow();
      expect(await readFile(join(deps.root, budgetPath), 'utf8')).toBe(before);
      expect(deps.readCredential).not.toHaveBeenCalled(); expect(deps.fetchImpl).not.toHaveBeenCalled();
    }
    const noReceipt = await fixture();
    const ordinary = noReceipt.fetchImpl.getMockImplementation();
    noReceipt.fetchImpl.mockImplementation((url, options) => options?.method === 'POST' ? Promise.reject(new Error('uncertain')) : ordinary(url, options));
    await expect(runMusicRevisions({ ...noReceipt, args: ARGS })).rejects.toThrow('outcome uncertain');
    noReceipt.fetchImpl.mockClear(); noReceipt.readCredential.mockClear();
    const before = await readFile(join(noReceipt.root, budgetPath), 'utf8');
    await expect(runMusicRevisions({ ...noReceipt, args: ['--reconcile'] })).rejects.toThrow('Complete candidate');
    expect(await readFile(join(noReceipt.root, budgetPath), 'utf8')).toBe(before);
    expect(noReceipt.fetchImpl).not.toHaveBeenCalled();
  });
  it('leaves the pending ledger unchanged when metering is stale, reversed or in a new billing period', async () => {
    for (const [used, resetAt] of [[1000, 5000000000], [999, 5000000000], [5773, 5000000001]]) {
      const deps = await unsettledFixture();
      deps.fetchImpl.mockResolvedValue({ ok: true, json: async () => ({ character_count: used, character_limit: 100000, next_character_count_reset_unix: resetAt }) });
      const before = await readFile(join(deps.root, budgetPath), 'utf8');
      await expect(runMusicRevisions({ ...deps, args: ['--reconcile'] })).rejects.toThrow();
      expect(await readFile(join(deps.root, budgetPath), 'utf8')).toBe(before);
      expect(paidCalls(deps)).toHaveLength(0);
    }
  });
  it('records all observed usage conservatively and locks further spending if reservation or cap is exceeded', async () => {
    for (const [used, status] of [[8000, 'stop-reservation-exceeded'], [52000, 'stop-budget-exceeded']]) {
      const deps = await unsettledFixture();
      deps.fetchImpl.mockResolvedValue({ ok: true, json: async () => ({ character_count: used, character_limit: 100000, next_character_count_reset_unix: 5000000000 }) });
      await expect(runMusicRevisions({ ...deps, args: ['--reconcile'] })).rejects.toThrow('exceeds the safety');
      const ledger = JSON.parse(await readFile(join(deps.root, budgetPath), 'utf8'));
      expect(ledger).toMatchObject({ status, activeRequest: null, observedCreditsUsedThisPass: used - 1000, remainingAuthorizedCredits: 51000 - used });
      expect(ledger.generations[0].observedCredits).toBe(used - 1000);
      await expect(runMusicRevisions({ ...deps, args: ['--generate', '--track=mission-aurora'] })).rejects.toThrow('Budget is not ready');
      expect(paidCalls(deps)).toHaveLength(0);
    }
  });
  it('prevents concurrent reconcilers from writing twice through retained exclusive evidence', async () => {
    const deps = await unsettledFixture();
    const results = await Promise.allSettled([
      runMusicRevisions({ ...deps, args: ['--reconcile'] }), runMusicRevisions({ ...deps, args: ['--reconcile'] }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(paidCalls(deps)).toHaveLength(0);
    expect(JSON.parse(await readFile(join(deps.root, budgetPath), 'utf8')).generations).toHaveLength(1);
  });
});
