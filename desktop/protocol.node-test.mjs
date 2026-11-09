import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAssetHandler } from './protocol.mjs';

test('packaged video streams whole and partial bytes with correct MIME, status and headers', async (t) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'aegis-protocol-test-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const root = path.join(fixture, 'dist'); await mkdir(root);
  const payload = Buffer.from('0123456789abcdefghij');
  await writeFile(path.join(root, 'intro.mp4'), payload);
  await writeFile(path.join(root, 'index.html'), '<html>game</html>');
  await writeFile(path.join(fixture, 'private.txt'), 'private');
  await symlink(path.join(fixture, 'private.txt'), path.join(root, 'escape.txt'));
  const handle = createAssetHandler(root);
  const request = (file, options) => new Request(`app://aegis/${file}`, options);
  const full = await handle(request('intro.mp4'));
  assert.equal(full.status, 200); assert.equal(full.headers.get('Content-Type'), 'video/mp4');
  assert.equal(full.headers.get('Content-Length'), '20'); assert.equal(full.headers.get('Accept-Ranges'), 'bytes');
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), payload);
  for (const [range, expected, contentRange] of [
    ['bytes=2-5', '2345', 'bytes 2-5/20'], ['bytes=17-', 'hij', 'bytes 17-19/20'],
    ['bytes=-3', 'hij', 'bytes 17-19/20'],
  ]) {
    const response = await handle(request('intro.mp4', { headers: { Range: range } }));
    assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), contentRange);
    assert.equal(await response.text(), expected);
  }
  const head = await handle(request('intro.mp4', { method: 'HEAD', headers: { Range: 'bytes=0-3' } }));
  assert.equal(head.status, 206); assert.equal(head.headers.get('Content-Length'), '4'); assert.equal(await head.text(), '');
  const invalid = await handle(request('intro.mp4', { headers: { Range: 'bytes=99-' } }));
  assert.equal(invalid.status, 416); assert.equal(invalid.headers.get('Content-Range'), 'bytes */20');
  assert.equal((await handle(request('intro.mp4', { method: 'POST' }))).status, 405);
  assert.equal((await handle(request('missing.png'))).status, 404);
  assert.equal((await handle(request('escape.txt'))).status, 403);
  assert.equal((await handle(request('.env'))).status, 403);
  const html = await handle(request('index.html'));
  assert.match(html.headers.get('Content-Security-Policy'), /default-src 'none'/);
  await html.arrayBuffer();
});
