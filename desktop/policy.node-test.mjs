import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { APP_URL, CONTENT_SECURITY_POLICY, WEB_PREFERENCES, isAllowedRequest, parseByteRange, resolveAssetPath } from './policy.mjs';

const root = path.resolve('/test/game/dist');
test('the renderer has no Node, preload, webview or insecure capabilities', () => {
  for (const key of ['contextIsolation', 'sandbox', 'webSecurity']) assert.equal(WEB_PREFERENCES[key], true);
  for (const key of ['nodeIntegration', 'nodeIntegrationInWorker', 'nodeIntegrationInSubFrames', 'webviewTag', 'allowRunningInsecureContent', 'devTools']) assert.equal(WEB_PREFERENCES[key], false);
  assert.equal('preload' in WEB_PREFERENCES, false);
  assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'/);
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-eval|https?:|\*/);
});
test('only the exact packaged origin is allowed', () => {
  assert.equal(isAllowedRequest(APP_URL), true);
  for (const url of ['https://aegis/', 'file:///etc/passwd', 'app://aegis.evil/a', 'app://evil/', 'app://user@aegis/', 'app://aegis:99/', 'javascript:alert(1)']) assert.equal(isAllowedRequest(url), false, url);
});
test('normal assets and cache queries resolve inside dist', () => {
  assert.equal(resolveAssetPath(root, 'app://aegis/'), path.join(root, 'index.html'));
  assert.equal(resolveAssetPath(root, 'app://aegis/audio/music.mp3?v=1'), path.join(root, 'audio/music.mp3'));
  assert.equal(resolveAssetPath(root, 'app://aegis/story/space%20shot.webp'), path.join(root, 'story/space shot.webp'));
});
test('raw and encoded traversal, OS aliases, hidden files and malformed escapes fail closed', () => {
  for (const entry of [
    '../secret', 'foo/../../secret', '%2e%2e/secret', 'foo/%2E%2E/secret', '%252e%252e/secret',
    'foo%2f..%2fsecret', 'foo%5c..%5csecret', '.env', '.git/config', 'x%00.mp4',
    'C:/secret', 'foo:bar', 'NUL', 'CON.txt', 'aux.mp4', 'thing.', 'thing%20', '%zz',
  ]) assert.equal(resolveAssetPath(root, `app://aegis/${entry}`), undefined, entry);
});
test('byte ranges support start/end, open-ended, suffix, clipping and full-file requests', () => {
  assert.equal(parseByteRange(null, 100), undefined);
  assert.deepEqual(parseByteRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseByteRange('bytes=50-', 100), { start: 50, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-7', 100), { start: 93, end: 99 });
  assert.deepEqual(parseByteRange('bytes=90-200', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-200', 100), { start: 0, end: 99 });
});
test('malformed, multipart and unsatisfiable ranges are rejected', () => {
  for (const range of ['bytes=100-', 'bytes=3-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-5', 'items=0-5', 'bytes=9007199254740999-']) assert.equal(parseByteRange(range, 100), null, range);
  assert.equal(parseByteRange('bytes=0-', 0), null);
});
