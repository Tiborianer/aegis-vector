import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from 'vite';
import { createRoomServer } from '../server/coop/rooms.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const out = path.resolve(process.argv[2] || 'outputs/arc-reconnect');
await mkdir(out, { recursive: true });
const room = createRoomServer();
room.http.listen(0, '127.0.0.1');
await once(room.http, 'listening');
const target = 'http://127.0.0.1:' + room.http.address().port;
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false,
  proxy: { '/coop': { target, ws: true } } } });
let browser;
try {
  await server.listen();
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
  const host = await browser.newPage();
  const guest = await browser.newPage();
  const errors = [];
  for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
  await guest.addInitScript(() => {
    window.shots = [];
    window.WebSocket = class extends WebSocket {
      constructor(...args) {
        super(...args);
        if (!String(args[0]).includes('/coop/socket')) return;
        window.roomSocket = this;
        this.addEventListener('message', e => {
          const m = JSON.parse(e.data);
          if (m.type === 'world') window.arcFrame = m.frame.wingArc;
        });
      }
    };
    window.addEventListener('aegis:sound', e => {
      if (e.detail?.wingArc) window.shots.push(e.detail.wingArc);
    });
  });
  await host.goto(origin + '/#two-pilots');
  await host.locator('#coop-create-room').click();
  await guest.goto(await host.locator('#coop-invite').inputValue());
  await guest.locator('#coop-join-room').click();
  await guest.locator('[data-seat="1"] [data-choice="ready"]').click();
  await host.locator('[data-seat="0"] [data-choice="ready"]').click();
  await host.locator('#intro-skip-button').click();
  await guest.waitForFunction(() => window.arcFrame?.chargeMs >= 1200);
  const reports = [];
  for (const downDuringGap of [false, true]) {
    await guest.keyboard.down('Space');
    await guest.waitForFunction(() => window.arcFrame.held && window.arcFrame.volley >= 2);
    const before = await guest.evaluate(() => {
      const frame = window.arcFrame;
      window.roomSocket.close();
      return frame;
    });
    await guest.getByText('Reconnecting', { exact: true }).waitFor();
    if (downDuringGap) {
      await guest.keyboard.up('Space');
      await guest.keyboard.down('Space');
    }
    await guest.waitForFunction(old => window.arcFrame.session > old && window.arcFrame.chargeMs >= 1200, before.session);
    const idle = await guest.evaluate(() => ({ frame: window.arcFrame, sounds: window.shots.filter(id =>
      id.startsWith(window.arcFrame.session + '/')) }));
    assert.deepEqual([idle.frame.held, idle.frame.press, idle.frame.volley, idle.sounds], [false, 0, 0, []]);
    await guest.keyboard.up('Space');
    await guest.keyboard.press('Space');
    await guest.waitForFunction(() => window.arcFrame.press === 1 && window.arcFrame.volley === 1 && !window.arcFrame.held);
    const result = await guest.evaluate(() => ({ session: window.arcFrame.session,
      sounds: window.shots.filter(id => id.startsWith(window.arcFrame.session + '/')) }));
    assert.deepEqual(result.sounds, [result.session + '/1/1']);
    reports.push({ downDuringGap, idle, result });
  }
  await guest.screenshot({ path: path.join(out, 'guest-reconnected.jpg'), quality: 85 });
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'reconnect.json'), JSON.stringify(reports, null, 2));
  console.log('Verified both held-fire reconnects in a two-browser local room.');
} finally {
  await browser?.close();
  await room.close();
  await server.close();
}
