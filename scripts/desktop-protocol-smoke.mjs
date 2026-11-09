// Run with an Electron executable, not plain Node. This test opens no BrowserWindow.
import { app, protocol, session } from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { APP_SCHEME, isAllowedRequest } from '../desktop/policy.mjs';
import { createAssetHandler } from '../desktop/protocol.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const testParent = path.join(root, 'work/desktop-protocol-smoke'); mkdirSync(testParent, { recursive: true });
app.setPath('userData', mkdtempSync(path.join(testParent, 'profile-')));
if (process.platform === 'darwin') app.setActivationPolicy('prohibited');
protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
const assetFlag = process.argv.indexOf('--asset-root');
const assets = assetFlag >= 0 ? path.resolve(process.argv[assetFlag + 1]) : path.join(root, 'dist');
app.whenReady().then(async () => {
  const ses = session.fromPartition('aegis-protocol-smoke');
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isAllowedRequest(details.url) }));
  ses.protocol.handle(APP_SCHEME, createAssetHandler(assets));
  const index = await ses.fetch('app://aegis/index.html');
  assert.equal(index.status, 200); assert.match(await index.text(), /Aegis Vector/);
  const video = await ses.fetch('app://aegis/cinematics/video/aegis-vector-intro-v2.mp4', { headers: { Range: 'bytes=0-31' } });
  assert.equal(video.status, 206); assert.equal(video.headers.get('Content-Type'), 'video/mp4');
  assert.match(video.headers.get('Content-Range'), /^bytes 0-31\/\d+$/);
  const bytes = Buffer.from(await video.arrayBuffer()); assert.equal(bytes.length, 32); assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
  const tail = await ses.fetch('app://aegis/cinematics/video/aegis-vector-intro-v2.mp4', { headers: { Range: 'bytes=-16' } });
  assert.equal(tail.status, 206); assert.equal((await tail.arrayBuffer()).byteLength, 16);
  await assert.rejects(ses.fetch('https://example.com/'));
  console.log(JSON.stringify({ status: 'passed', runtime: process.versions.electron, assets, range: video.headers.get('Content-Range'), externalNetwork: 'blocked', windowsOpened: 0 }));
  app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
