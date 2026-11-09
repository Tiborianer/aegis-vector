import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, readdir, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missionMusicErrorMessage, parseMissionMusicArgs, runMissionMusic } from './generate-mission-music.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TRACK = 'mission-stormbreak';
const ARGS = ['--generate', `--track=${TRACK}`];
const SECRET = 'mock-credential-never-log';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'aegis-mission-music-test-'));
  await mkdir(join(root, 'docs/audio'), { recursive: true });
  await mkdir(join(root, 'src/audio'), { recursive: true });
  const plan = JSON.parse(await readFile(join(ROOT, 'docs/audio/mission-score-prompts.json'), 'utf8'));
  const manifest = Object.fromEntries(Object.entries(plan.tracks).map(([track, spec]) => [track, { file: null, status: 'awaiting-elevenlabs', fallback: spec.fallback }]));
  // The original generator still owns only its five v1 tracks. Aurora is a
  // separate pending identity handled by the versioned revision workflow.
  manifest['mission-aurora'] = { file: null, status: 'awaiting-elevenlabs', fallback: 'audio/mission-coastal.mp3' };
  const manifestPath = join(root, 'src/audio/mission-scores.json');
  await writeFile(join(root, 'docs/audio/mission-score-prompts.json'), JSON.stringify(plan));
  await writeFile(manifestPath, JSON.stringify(manifest));
  const bytes = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(100_000, 1)]);
  const fetchImpl = vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes, headers: new Headers({ 'song-id': 'mock-song-01' }) }));
  const readCredential = vi.fn(async () => SECRET);
  const log = vi.fn();
  return { root, plan, manifest, manifestPath, fetchImpl, readCredential, log };
}

describe('offline mission music production safety', () => {
  it('has no import-time CLI, credential, or network side effects', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('./generate-mission-music.mjs', import.meta.url).href)})`], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('defaults to dry-run for all five tracks without credentials, API calls, files, or manifest changes', async () => {
    const deps = await fixture();
    const before = await readFile(deps.manifestPath, 'utf8');
    const results = await runMissionMusic(deps);
    expect(results).toHaveLength(5);
    expect(results.every(({ status }) => status === 'dry-run')).toBe(true);
    expect(deps.readCredential).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(await readdir(deps.root)).toEqual(['docs', 'src']);
    expect(await readFile(deps.manifestPath, 'utf8')).toBe(before);
  });

  it('requires one explicit valid track and refuses ambiguous or unknown flags', async () => {
    for (const args of [['--generate'], ['--track=../secret'], [...ARGS, '--dry-run'], [...ARGS, '--track=mission-graveyard'], ['--force']]) {
      expect(() => parseMissionMusicArgs(args)).toThrow();
    }
    const deps = await fixture();
    await expect(runMissionMusic({ ...deps, args: ['--generate', '--track=mission-missing'] })).rejects.toThrow('Unknown mission track');
    expect(deps.readCredential).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks an existing source, partial, request or receipt before credential access', async () => {
    for (const path of [
      'public/audio/missions/mission-stormbreak-v1.mp3', 'public/audio/missions/mission-stormbreak-v1.mp3.partial',
      'assets/audio/mission-scores/mission-stormbreak.request.json', 'assets/audio/mission-scores/mission-stormbreak.receipt.json',
    ]) {
      const deps = await fixture();
      const target = join(deps.root, path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, 'preserve');
      await expect(runMissionMusic({ ...deps, args: ARGS })).rejects.toThrow('output or pending request exists');
      expect(deps.readCredential).not.toHaveBeenCalled();
      expect(deps.fetchImpl).not.toHaveBeenCalled();
      expect(await readFile(target, 'utf8')).toBe('preserve');
    }
  });

  it('also protects a dangling symlink at the output path', async () => {
    const deps = await fixture();
    const target = join(deps.root, 'public/audio/missions/mission-stormbreak-v1.mp3');
    await mkdir(join(target, '..'), { recursive: true });
    await symlink(join(deps.root, 'not-created.mp3'), target);
    await expect(runMissionMusic({ ...deps, args: ARGS })).rejects.toThrow('output or pending request exists');
    expect(deps.readCredential).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('writes only generated status, retains request evidence, and does not regenerate generated or reviewed entries', async () => {
    const deps = await fixture();
    expect(await runMissionMusic({ ...deps, args: ARGS })).toEqual([{ track: TRACK, status: 'generated' }]);
    const score = JSON.parse(await readFile(deps.manifestPath, 'utf8'))[TRACK];
    expect(score.status).toBe('generated');
    expect(score.review).toContain('pending decode');
    expect(score.fallback).toBe(deps.plan.tracks[TRACK].fallback);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = deps.fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128');
    expect(JSON.parse(request.body)).toMatchObject({ model_id: 'music_v2_5', music_length_ms: 180000, force_instrumental: true });
    const directory = join(deps.root, 'assets/audio/mission-scores');
    const pending = await readFile(join(directory, `${TRACK}.request.json`), 'utf8');
    expect(JSON.parse(pending).status).toBe('request-started');
    const receipt = await readFile(join(directory, `${TRACK}.receipt.json`), 'utf8');
    expect(receipt).not.toContain(SECRET);
    expect(pending).not.toContain(SECRET);
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain(SECRET);
    for (const status of ['generated', 'reviewed']) {
      const manifest = JSON.parse(await readFile(deps.manifestPath, 'utf8'));
      manifest[TRACK].status = status;
      await writeFile(deps.manifestPath, JSON.stringify(manifest));
      expect(await runMissionMusic({ ...deps, args: ARGS })).toEqual([{ track: TRACK, status: 'skipped' }]);
    }
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    expect(deps.readCredential).toHaveBeenCalledTimes(1);
  });

  it('activates only reviewed scores in the actual SoundEngine mapping, using fallbacks for generated audio', async () => {
    const deps = await fixture();
    try {
      for (const status of ['awaiting-elevenlabs', 'generated', 'reviewed']) {
        const scores = structuredClone(deps.manifest);
        scores[TRACK] = { ...scores[TRACK], status, file: deps.plan.tracks[TRACK].file };
        vi.resetModules();
        vi.doMock('../src/audio/mission-scores.json', () => ({ default: scores }));
        const { MUSIC_ASSETS } = await import('../src/audio/SoundEngine.ts');
        expect(MUSIC_ASSETS[TRACK].files).toEqual([status === 'reviewed' ? scores[TRACK].file : scores[TRACK].fallback]);
      }
    } finally {
      vi.doUnmock('../src/audio/mission-scores.json');
      vi.resetModules();
    }
  });

  it('does not retry uncertain fetch or response-transfer failures, and does not expose their messages', async () => {
    for (const phase of ['fetch', 'transfer']) {
      const deps = await fixture();
      if (phase === 'fetch') deps.fetchImpl.mockRejectedValue(new Error(SECRET));
      else deps.fetchImpl.mockResolvedValue({ ok: true, arrayBuffer: async () => { throw new Error(SECRET); } });
      let failure;
      try { await runMissionMusic({ ...deps, args: ARGS }); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect(missionMusicErrorMessage(failure)).not.toContain(SECRET);
      expect(missionMusicErrorMessage(failure)).toMatch(/uncertain|incomplete/);
      await expect(runMissionMusic({ ...deps, args: ARGS })).rejects.toThrow('output or pending request exists');
      expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
      expect(deps.readCredential).toHaveBeenCalledTimes(1);
      expect(JSON.parse(await readFile(deps.manifestPath, 'utf8'))[TRACK].status).toBe('awaiting-elevenlabs');
    }
  });

  it('never reads provider error bodies or retries rejected requests', async () => {
    const deps = await fixture();
    const text = vi.fn(async () => SECRET);
    const arrayBuffer = vi.fn(async () => Buffer.from(SECRET));
    deps.fetchImpl.mockResolvedValue({ ok: false, status: 402, text, arrayBuffer });
    await expect(runMissionMusic({ ...deps, args: ARGS })).rejects.toThrow('provider body suppressed');
    expect(text).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
    await expect(runMissionMusic({ ...deps, args: ARGS })).rejects.toThrow('output or pending request exists');
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('blocks malformed success audio and retains the receipt for manual recovery', async () => {
    const deps = await fixture();
    deps.fetchImpl.mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.alloc(120000, 1) });
    await expect(runMissionMusic({ ...deps, args: ARGS })).rejects.toThrow('not a plausible non-empty MP3');
    await expect(runMissionMusic({ ...deps, args: ARGS })).rejects.toThrow('output or pending request exists');
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('allows only one request when same-track invocations race', async () => {
    const deps = await fixture();
    await Promise.allSettled([runMissionMusic({ ...deps, args: ARGS }), runMissionMusic({ ...deps, args: ARGS })]);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cannot overwrite an output that appears after the initial existence check', async () => {
    const deps = await fixture();
    const destination = join(deps.root, 'public', deps.plan.tracks[TRACK].file);
    const response = await deps.fetchImpl();
    deps.fetchImpl.mockClear();
    deps.fetchImpl.mockImplementation(async () => {
      await writeFile(destination, 'concurrent owner file', { flag: 'wx' });
      return response;
    });
    await expect(runMissionMusic({ ...deps, args: ARGS })).rejects.toThrow();
    expect(await readFile(destination, 'utf8')).toBe('concurrent owner file');
    expect(JSON.parse(await readFile(deps.manifestPath, 'utf8'))[TRACK].status).toBe('awaiting-elevenlabs');
  });

  it('keeps unrelated manifest edits made while a request is in progress', async () => {
    const deps = await fixture();
    const response = await deps.fetchImpl();
    deps.fetchImpl.mockImplementation(async () => {
      const latest = JSON.parse(await readFile(deps.manifestPath, 'utf8'));
      latest['mission-graveyard'].review = 'owner note added during generation';
      await writeFile(deps.manifestPath, JSON.stringify(latest));
      return response;
    });
    await runMissionMusic({ ...deps, args: ARGS });
    const manifest = JSON.parse(await readFile(deps.manifestPath, 'utf8'));
    expect(manifest['mission-graveyard'].review).toBe('owner note added during generation');
  });

  it('sanitizes credential and unexpected errors without producing a request', async () => {
    const deps = await fixture();
    deps.readCredential.mockRejectedValue(new Error(SECRET));
    await expect(runMissionMusic({ ...deps, args: ARGS })).rejects.toThrow('Credential unavailable or invalid');
    expect(missionMusicErrorMessage(new Error(SECRET))).not.toContain(SECRET);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(await readdir(deps.root)).toEqual(['docs', 'src']);
  });
});
