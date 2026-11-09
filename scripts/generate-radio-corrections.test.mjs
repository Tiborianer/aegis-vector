import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRadioCorrectionArgs, runRadioCorrections } from './generate-radio-corrections.mjs';

const productionPlan = fileURLToPath(new URL('../docs/audio/radio-corrections-plan.json', import.meta.url));
const liveArgs = ['--generate', '--cue=arc-upgraded', '--voice-id=observedSarahFixture123'];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'aegis-radio-correction-test-'));
  await mkdir(join(root, 'docs/audio'), { recursive: true });
  await writeFile(join(root, 'docs/audio/radio-corrections-plan.json'), await readFile(productionPlan));
  const log = vi.fn();
  const readCredential = vi.fn(async () => 'mock-secret-never-log');
  const bytes = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(2_000, 1)]);
  const fetchImpl = vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes }));
  return { root, log, readCredential, fetchImpl };
}

describe('bounded radio correction workflow', () => {
  it('defaults to two dry-run records without reading credentials, requesting audio or writing assets', async () => {
    const deps = await fixture();
    expect(await runRadioCorrections(deps)).toEqual([
      { cue: 'arc-upgraded', status: 'dry-run' }, { cue: 'ion-upgraded', status: 'dry-run' },
    ]);
    expect(deps.readCredential).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(await readdir(deps.root)).toEqual(['docs']);
  });

  it('requires an explicit single cue and observed ID; rejects ambiguity and unapproved options', () => {
    for (const args of [
      ['--generate'], ['--generate', '--cue=arc-upgraded'], ['--generate', '--voice-id=observedSarahFixture123'],
      ['--cue=shield-down'], ['--cue=../arc-upgraded'], [...liveArgs, '--dry-run'],
      [...liveArgs, '--cue=ion-upgraded'], ['--voice-id=https://example.invalid/voice'], ['--force'],
      ['--take=ion-v4'], ['--take=ion-v4', '--cue=arc-upgraded'], ['--take=ion-v5', '--cue=ion-upgraded'],
    ]) expect(() => parseRadioCorrectionArgs(args)).toThrow();
  });

  it('keeps the explicit Ion v4 retake dry-run and isolated from existing v3 recordings', async () => {
    const deps = await fixture();
    const args = ['--cue=ion-upgraded', '--take=ion-v4'];
    expect(await runRadioCorrections({ ...deps, args })).toEqual([{ cue: 'ion-upgraded', status: 'dry-run' }]);
    expect(deps.readCredential).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(deps.log.mock.calls)).toContain('Eye-on conductor upgraded.');
    expect(await readdir(deps.root)).toEqual(['docs']);
    const oldDirectory = join(deps.root, 'assets/audio/voice-v3');
    await mkdir(oldDirectory, { recursive: true });
    await writeFile(join(oldDirectory, 'ion-upgraded.mp3'), 'preserved rejected take');
    expect(await runRadioCorrections({ ...deps, args: [...args, '--generate', '--voice-id=observedSarahFixture123'] }))
      .toEqual([{ cue: 'ion-upgraded', status: 'source-saved' }]);
    const request = JSON.parse(deps.fetchImpl.mock.calls[0][1].body);
    expect(request.text).toBe('Eye-on conductor upgraded.');
    expect(request.model_id).toBe('eleven_multilingual_v2');
    const receipt = JSON.parse(await readFile(join(deps.root, 'assets/audio/voice-v4/ion-upgraded.receipt.json'), 'utf8'));
    expect(receipt.take).toBe('ion-v4');
    expect(receipt.source).toBe('assets/audio/voice-v4/ion-upgraded.mp3');
    expect(await readFile(join(oldDirectory, 'ion-upgraded.mp3'), 'utf8')).toBe('preserved rejected take');
    await runRadioCorrections({ ...deps, args: [...args, '--generate', '--voice-id=observedSarahFixture123'] });
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects an altered v4 phrase before reading credentials', async () => {
    const deps = await fixture();
    const plan = JSON.parse(await readFile(productionPlan, 'utf8'));
    plan.retakes['ion-v4'].phrase = 'Unapproved text';
    await writeFile(join(deps.root, 'docs/audio/radio-corrections-plan.json'), JSON.stringify(plan));
    await expect(runRadioCorrections({ ...deps, args: ['--generate', '--cue=ion-upgraded', '--take=ion-v4', '--voice-id=observedSarahFixture123'] }))
      .rejects.toThrow('Ion v4 retake plan differs');
    expect(deps.readCredential).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('sends exactly one v2 request and saves secret-free request and success receipts without runtime edits', async () => {
    const deps = await fixture();
    expect(await runRadioCorrections({ ...deps, args: liveArgs })).toEqual([{ cue: 'arc-upgraded', status: 'source-saved' }]);
    expect(deps.readCredential).toHaveBeenCalledTimes(1);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = deps.fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/observedSarahFixture123?output_format=mp3_44100_128');
    expect(JSON.parse(request.body)).toEqual({
      text: 'Arc cannon upgraded.', model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: .7, similarity_boost: .75, style: 0, use_speaker_boost: true, speed: 1 },
    });
    const directory = join(deps.root, 'assets/audio/voice-v3');
    const files = await readdir(directory);
    expect(files.sort()).toEqual(['arc-upgraded.mp3', 'arc-upgraded.receipt.json', 'arc-upgraded.request.json']);
    const receiptText = await readFile(join(directory, 'arc-upgraded.receipt.json'), 'utf8');
    expect(receiptText).not.toContain('mock-secret');
    expect(receiptText).toContain('Pending offline decode');
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('mock-secret');
    expect(await readdir(deps.root)).not.toContain('public');
    await runRadioCorrections({ ...deps, args: liveArgs });
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    expect(deps.readCredential).toHaveBeenCalledTimes(1);
  });

  it('skips existing WAV, source, partial or receipt before reading any key', async () => {
    for (const path of [
      'public/audio/voice-v3/arc-upgraded.wav', 'assets/audio/voice-v3/arc-upgraded.mp3',
      'assets/audio/voice-v3/arc-upgraded.mp3.partial', 'assets/audio/voice-v3/arc-upgraded.request.json',
      'assets/audio/voice-v3/arc-upgraded.receipt.json', 'assets/audio/voice-v3/arc-upgraded.processing.request.json',
      'assets/audio/voice-v3/arc-upgraded.processing.receipt.json', 'assets/audio/voice-v3/raw/arc-upgraded.wav',
    ]) {
      const deps = await fixture();
      const target = join(deps.root, path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, 'existing');
      expect(await runRadioCorrections({ ...deps, args: liveArgs })).toEqual([{ cue: 'arc-upgraded', status: 'skipped' }]);
      expect(deps.readCredential).not.toHaveBeenCalled();
      expect(deps.fetchImpl).not.toHaveBeenCalled();
      expect(await readFile(target, 'utf8')).toBe('existing');
    }
  });

  it('retains the request marker after an uncertain network failure and never automatically retries', async () => {
    const deps = await fixture();
    deps.fetchImpl.mockRejectedValue(new Error('provider-secret-body mock-secret-never-log'));
    await expect(runRadioCorrections({ ...deps, args: liveArgs })).rejects.toThrow('Request outcome uncertain');
    expect(await runRadioCorrections({ ...deps, args: liveArgs })).toEqual([{ cue: 'arc-upgraded', status: 'skipped' }]);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('provider-secret');
  });

  it('allows at most one paid request when two invocations race for the same cue', async () => {
    const deps = await fixture();
    await Promise.allSettled([
      runRadioCorrections({ ...deps, args: liveArgs }), runRadioCorrections({ ...deps, args: liveArgs }),
    ]);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retains the marker when the audio transfer fails after a successful response', async () => {
    const deps = await fixture();
    deps.fetchImpl.mockResolvedValue({ ok: true, arrayBuffer: async () => { throw new Error('unsafe transfer diagnostics'); } });
    await expect(runRadioCorrections({ ...deps, args: liveArgs })).rejects.toThrow('Response transfer incomplete');
    expect(await runRadioCorrections({ ...deps, args: liveArgs })).toEqual([{ cue: 'arc-upgraded', status: 'skipped' }]);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not inspect or echo provider error bodies', async () => {
    const deps = await fixture();
    const text = vi.fn(async () => 'private provider body');
    const arrayBuffer = vi.fn();
    deps.fetchImpl.mockResolvedValue({ ok: false, status: 402, text, arrayBuffer });
    await expect(runRadioCorrections({ ...deps, args: liveArgs })).rejects.toThrow('ElevenLabs HTTP 402; provider body suppressed');
    expect(text).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('blocks malformed success bytes, keeping the marker to prevent another paid call', async () => {
    const deps = await fixture();
    deps.fetchImpl.mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from('{"private":"not audio"}') });
    await expect(runRadioCorrections({ ...deps, args: liveArgs })).rejects.toThrow('not a plausible short MP3');
    expect(await runRadioCorrections({ ...deps, args: liveArgs })).toEqual([{ cue: 'arc-upgraded', status: 'skipped' }]);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('requires the bounded model, phrases, and matching Sarah settings before credential access', async () => {
    const deps = await fixture();
    const plan = JSON.parse(await readFile(productionPlan, 'utf8'));
    plan.voice_settings.stability = .5;
    await writeFile(join(deps.root, 'docs/audio/radio-corrections-plan.json'), JSON.stringify(plan));
    await expect(runRadioCorrections({ ...deps, args: liveArgs })).rejects.toThrow('differs from the bounded');
    expect(deps.readCredential).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('suppresses arbitrary credential errors before any paid request or receipt is written', async () => {
    const deps = await fixture();
    deps.readCredential.mockRejectedValue(new Error('unsafe mock-secret-never-log'));
    await expect(runRadioCorrections({ ...deps, args: liveArgs })).rejects.toThrow('Credential unavailable or invalid');
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(await readdir(deps.root)).toEqual(['docs']);
  });
});
