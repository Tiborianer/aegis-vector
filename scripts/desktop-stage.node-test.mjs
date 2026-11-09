import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rename, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { SHELL_FILES, stageDesktop } from './desktop-stage.mjs';
import { DESKTOP_PUBLIC_ASSETS, isDesktopAsset } from './desktop-assets.mjs';

test('packaging allowlist copies only dist and the three shell files, never project secrets/dependencies', async (t) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'aegis-stage-test-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const dir of ['dist', 'desktop', 'node_modules']) await mkdir(path.join(fixture, dir));
  await mkdir(path.join(fixture, 'node_modules/phaser'));
  await writeFile(path.join(fixture, 'node_modules/phaser/LICENSE.md'), 'MIT notice');
  await mkdir(path.join(fixture, 'node_modules/eventemitter3'));
  await writeFile(path.join(fixture, 'node_modules/eventemitter3/LICENSE'), 'EventEmitter3 MIT notice');
  for (const file of SHELL_FILES) await writeFile(path.join(fixture, 'desktop', file), '// shell');
  for (const asset of DESKTOP_PUBLIC_ASSETS) {
    await mkdir(path.dirname(path.join(fixture, 'dist', asset)), { recursive: true });
    await writeFile(path.join(fixture, 'dist', asset), 'asset');
  }
  await mkdir(path.join(fixture, 'dist/assets'));
  for (const [file, text] of [['dist/index.html', 'game'], ['dist/assets/app.js', 'game'], ['dist/assets/app.js.map', 'source'], ['dist/.env', 'secret'], ['dist/.DS_Store', 'finder metadata'], ['.env', 'secret'], ['desktop/policy.test.mjs', 'tests'], ['node_modules/private.js', 'dependency'], ['dist/cinematics/keyframes/scene-01-end.webp', 'retired']]) await writeFile(path.join(fixture, file), text);
  const stageRoot = path.join(fixture, 'stage');
  const files = await stageDesktop({ projectRoot: fixture, stageRoot, version: '0.1.0' });
  assert.deepEqual(files, ['desktop/main.mjs', 'desktop/policy.mjs', 'desktop/protocol.mjs', 'dist/assets/app.js', 'dist/index.html', 'licenses/EVENTEMITTER3-LICENSE.txt', 'licenses/PHASER-LICENSE.txt', 'package.json', ...DESKTOP_PUBLIC_ASSETS.map((asset) => `dist/${asset}`)].sort());
  assert.equal(await readFile(path.join(stageRoot, 'licenses/EVENTEMITTER3-LICENSE.txt'), 'utf8'), 'EventEmitter3 MIT notice');
  const manifest = JSON.parse(await readFile(path.join(stageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.main, 'desktop/main.mjs'); assert.equal(manifest.dependencies, undefined);
  const requiredVoice = path.join(fixture, 'dist/audio/voice-v2/shield-down.wav');
  await rename(requiredVoice, path.join(fixture, 'retained-voice.wav'));
  await assert.rejects(stageDesktop({ projectRoot: fixture, stageRoot: path.join(fixture, 'missing-stage'), version: '0.1.0' }), /active assets missing.*audio\/voice-v2\/shield-down\.wav/);
  await rename(path.join(fixture, 'retained-voice.wav'), requiredVoice);
  await symlink(path.join(fixture, '.env'), path.join(fixture, 'dist', 'leak.txt'));
  await assert.rejects(stageDesktop({ projectRoot: fixture, stageRoot: path.join(fixture, 'bad-stage'), version: '0.1.0' }), /symlink/);
});

test('desktop asset contract keeps current media and excludes retained legacy originals', () => {
  assert.equal(new Set(DESKTOP_PUBLIC_ASSETS).size, DESKTOP_PUBLIC_ASSETS.length);
  assert.equal(DESKTOP_PUBLIC_ASSETS.length, 170);
  for (const file of ['audio/voice/shield-down.wav', 'audio/cinematic/aegis-vector-intro-score-v1.wav',
    'audio/cinematic/aegis-vector-battle-starts-now-v1.wav', 'cinematics/keyframes/scene-05-end.webp',
    'story/last-vector/last-vector-01.webp', 'story-v2/first-signal/first-signal-01.jpg',
    'story-v3/forked-truth/03.jpg',
    'graphics-v2/expansion-manifest.json', '.DS_Store', 'assets/secret.json', 'assets/app.js.map']) assert.equal(isDesktopAsset(file), false, file);
  for (const file of ['audio/voice-v2/shield-down.wav', 'story-v5/last-vector/03.webp', 'story-v3/forked-truth/03-v5.webp', 'cinematics/keyframes/scene-01-start.webp', 'assets/index-ABC123.js', 'assets/index-ABC123.css']) assert.equal(isDesktopAsset(file), true, file);
});
