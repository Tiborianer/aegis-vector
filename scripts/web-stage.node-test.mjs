import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { stageWeb } from './web-stage.mjs';
import { DESKTOP_PUBLIC_ASSETS } from './desktop-assets.mjs';

async function fixture(t) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'aegis-web-test-'));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const put = async (file, content = 'asset') => {
    await mkdir(path.dirname(path.join(projectRoot, file)), { recursive: true });
    await writeFile(path.join(projectRoot, file), content);
  };
  for (const file of DESKTOP_PUBLIC_ASSETS) await put(`dist/${file}`);
  await put('dist/index.html', '<link href="./assets/index-1.css"><script type="module" src="./assets/index-1.js"></script>');
  await put('dist/assets/index-1.js'); await put('dist/assets/index-1.css');
  await put('node_modules/phaser/LICENSE.md', 'MIT');
  await put('node_modules/eventemitter3/LICENSE', 'MIT');
  return { projectRoot, put };
}

test('web release contains active game files and notices, not retained media or private working files', async (t) => {
  const { projectRoot, put } = await fixture(t);
  for (const file of ['.env', 'dist/.env', 'dist/assets/index-1.js.map', 'dist/reviews/internal.html',
    'dist/audio/voice/shield-down.wav', 'dist/audio/cinematic/old-score.wav', 'dist/story-v2/old.jpg']) await put(file, 'preserved');
  const release = await stageWeb({ projectRoot, revision: 'verified-commit' });
  assert.equal(release.activeAssets, 170);
  assert.equal(release.files.length, 173);
  assert.deepEqual((await readdir(path.join(projectRoot, 'web-dist/assets'))).sort(), ['index-1.css', 'index-1.js']);
  const stamp = JSON.parse(await readFile(path.join(projectRoot, 'web-dist/release.json'), 'utf8'));
  assert.equal(stamp.revision, 'verified-commit');
  for (const file of ['.env', 'reviews', 'audio/voice', 'audio/cinematic', 'story-v2']) {
    await assert.rejects(readFile(path.join(projectRoot, 'web-dist', file)), { code: 'ENOENT' });
  }
  assert.equal(await readFile(path.join(projectRoot, 'dist/audio/voice/shield-down.wav'), 'utf8'), 'preserved');
  assert.equal(await readFile(path.join(projectRoot, 'web-dist/licenses/PHASER-LICENSE.txt'), 'utf8'), 'MIT');
  await assert.rejects(stageWeb({ projectRoot }), /destination already exists/);
});

test('web staging fails for missing or empty active files and broken HTML references', async (t) => {
  const { projectRoot, put } = await fixture(t);
  await put('dist/audio/voice-v5/shield-hit.wav', '');
  await assert.rejects(stageWeb({ projectRoot }), /empty.*shield-hit/);
  await put('dist/audio/voice-v5/shield-hit.wav');
  await put('dist/index.html', '<link href="./assets/index-1.css"><script src="./assets/missing.js"></script>');
  await assert.rejects(stageWeb({ projectRoot }), /missing or unsupported bundles/);
});

test('web staging rejects symlinked bundles', async (t) => {
  const { projectRoot, put } = await fixture(t);
  await put('private-key', 'not-a-real-secret');
  await symlink(path.join(projectRoot, 'private-key'), path.join(projectRoot, 'dist/assets/sneaky.js'));
  await assert.rejects(stageWeb({ projectRoot }), /symlink/);
});
