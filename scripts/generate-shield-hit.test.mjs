import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShieldHit, shieldHitErrorMessage } from './generate-shield-hit.mjs';

const planPath = new URL('../docs/audio/shield-hit-v5-plan.json', import.meta.url);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'aegis-shield-hit-'));
  await mkdir(join(root, 'docs/audio'), { recursive: true });
  await writeFile(join(root, 'docs/audio/shield-hit-v5-plan.json'), await readFile(planPath));
  let reads = 0;
  const bytes = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(2000, 1)]);
  const fetchImpl = vi.fn(async (_url, request) => request?.method === 'POST'
    ? { ok: true, arrayBuffer: async () => bytes }
    : { ok: true, json: async () => ({ character_count: reads++ ? 1011 : 1000, character_limit: 20000, next_character_count_reset_unix: 123, tier: 'creator' }) });
  return { root, fetchImpl, readCredential: vi.fn(async () => 'mock-private-key'), log: vi.fn() };
}
const postCalls = (deps) => deps.fetchImpl.mock.calls.filter(([, request]) => request?.method === 'POST');

describe('bounded Shield Hit production workflow', () => {
  it('defaults to a credential-free, network-free, write-free dry run', async () => {
    const d = await fixture();
    expect(await runShieldHit(d)).toEqual({ status: 'dry-run' });
    expect(d.readCredential).not.toHaveBeenCalled(); expect(d.fetchImpl).not.toHaveBeenCalled();
    expect(await readdir(d.root)).toEqual(['docs']);
  });
  it('rejects ambiguous or expanded actions before credential access', async () => {
    const d = await fixture();
    for (const args of [['--force'], ['--generate', '--dry-run'], ['--voice-id=another']]) {
      await expect(runShieldHit({ ...d, args })).rejects.toThrow('Choose one action');
    }
    expect(d.readCredential).not.toHaveBeenCalled();
  });
  it('bounds approval, voice, exact phrase, processing seed and ECHO settings', async () => {
    const d = await fixture(); const plan = JSON.parse(await readFile(planPath, 'utf8'));
    for (const [field, value] of [['authorizationApproved', false], ['maximumCredits', 201], ['phrase', 'different'], ['voiceId', 'different'], ['noiseSeed', 7205], ['voice_settings', { ...plan.voice_settings, stability: .7 }]]) {
      await writeFile(join(d.root, 'docs/audio/shield-hit-v5-plan.json'), JSON.stringify({ ...plan, [field]: value }));
      await expect(runShieldHit({ ...d, args: ['--generate'] })).rejects.toThrow('bounded, approved');
    }
    expect(d.readCredential).not.toHaveBeenCalled();
  });
  it('makes one short Alice request, keeps secret-free receipts and records observed credit use', async () => {
    const d = await fixture();
    expect(await runShieldHit({ ...d, args: ['--generate'] })).toEqual({ status: 'source-saved', observedCredits: 11 });
    expect(postCalls(d)).toHaveLength(1);
    expect(JSON.parse(postCalls(d)[0][1].body)).toEqual({ text: 'Shield hit.', model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: .8, similarity_boost: .75, style: 0, use_speaker_boost: true, speed: 1 } });
    const receipt = await readFile(join(d.root, 'assets/audio/voice-v5/shield-hit.receipt.json'), 'utf8');
    expect(receipt).not.toContain('mock-private-key');
    expect(JSON.stringify(d.log.mock.calls)).not.toContain('mock-private-key');
    expect(await runShieldHit({ ...d, args: ['--generate'] })).toEqual({ status: 'skipped' });
    expect(d.readCredential).toHaveBeenCalledTimes(1); expect(postCalls(d)).toHaveLength(1);
  });
  it('blocks a request when existing credits cannot cover the safety reservation', async () => {
    const d = await fixture();
    d.fetchImpl.mockResolvedValue({ ok: true, json: async () => ({ character_count: 19900, character_limit: 20000, next_character_count_reset_unix: 123 }) });
    await expect(runShieldHit({ ...d, args: ['--generate'] })).rejects.toThrow('safety reservation');
    expect(postCalls(d)).toHaveLength(0); expect(await readdir(d.root)).toEqual(['docs']);
  });
  it('retains evidence after uncertain generation and never retries', async () => {
    const d = await fixture(); const original = d.fetchImpl.getMockImplementation();
    d.fetchImpl.mockImplementation(async (url, request) => { if (request?.method === 'POST') throw new Error('private provider text'); return original(url, request); });
    await expect(runShieldHit({ ...d, args: ['--generate'] })).rejects.toThrow('outcome uncertain');
    expect(await runShieldHit({ ...d, args: ['--generate'] })).toEqual({ status: 'skipped' });
    expect(postCalls(d)).toHaveLength(1); expect(JSON.stringify(d.log.mock.calls)).not.toContain('private provider text');
  });
  it('does not echo arbitrary exception details', () => {
    expect(shieldHitErrorMessage(new Error('private secret'))).not.toContain('private secret');
  });
  it('allows only one paid request under concurrent invocation', async () => {
    const d = await fixture();
    await Promise.allSettled([runShieldHit({ ...d, args: ['--generate'] }), runShieldHit({ ...d, args: ['--generate'] })]);
    expect(postCalls(d)).toHaveLength(1);
  });
  it('reconciles lagging usage read-only without another generation', async () => {
    const d = await fixture(); const original = d.fetchImpl.getMockImplementation();
    d.fetchImpl.mockImplementation(async (url, request) => request?.method === 'POST' ? original(url, request)
      : { ok: true, json: async () => ({ character_count: 1000, character_limit: 20000, next_character_count_reset_unix: 123 }) });
    await expect(runShieldHit({ ...d, args: ['--generate'] })).rejects.toThrow('metering is not settled');
    d.fetchImpl.mockImplementation(async () => ({ ok: true, json: async () => ({ character_count: 1011, character_limit: 20000, next_character_count_reset_unix: 123 }) }));
    expect(await runShieldHit({ ...d, args: ['--reconcile'] })).toEqual({ status: 'source-saved', observedCredits: 11 });
    expect(postCalls(d)).toHaveLength(1);
  });
});
