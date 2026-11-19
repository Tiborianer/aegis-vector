import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import { createServer as createHttpsServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createRoomServer } from '../server/coop/rooms.mjs';

// Exercise the same HTTPS game + separate WSS relay deployment used by private invites.
// Each message traverses two 38ms hops in each direction. Drop replaceable world
// snapshots only. Control messages retain ordered, reliable WebSocket semantics.
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
const dir = await mkdtemp(path.join(tmpdir(), 'aegis-tls-qa-'));
const cert = path.join(dir, 'cert.pem'),
  key = path.join(dir, 'key.pem');
const services = [],
  clients = new Set();
let snapshots = 0,
  dropped = 0,
  bytes = 0,
  maxFrame = 0;
try {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-keyout',
      key,
      '-out',
      cert,
    ],
    { stdio: 'ignore' },
  );
  const tls = { cert: await readFile(cert), key: await readFile(key) };
  const site = createRoomServer({ root: path.resolve(process.env.AEGIS_WEB_DIR || 'web-dist'), tls });
  services.push(site);
  const siteOrigin = 'https://127.0.0.1:' + (await listen(site.http));
  const relay = createRoomServer({ origins: [siteOrigin] });
  services.push(relay);
  const upstream = 'ws://127.0.0.1:' + (await listen(relay.http)) + '/coop/socket';
  const edge = createHttpsServer(tls),
    wss = new WebSocketServer({ noServer: true });
  const endpoint = 'wss://127.0.0.1:' + (await listen(edge)) + '/coop/socket';
  services.push({
    close: async () => {
      for (const s of clients) s.terminate();
      wss.close();
      await new Promise((resolve) => edge.close(resolve));
    },
  });
  let warming = true;
  edge.on('upgrade', (req, socket, head) => {
    if (req.url !== '/coop/socket' || req.headers.origin !== siteOrigin) {
      socket.destroy();
      return;
    }
    // A free hosted instance can briefly reject the initial handshake while waking.
    if (warming) {
      warming = false;
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (front) => {
      const back = new WebSocket(upstream, { origin: siteOrigin });
      for (const s of [front, back]) {
        clients.add(s);
        s.on('error', () => {});
        s.on('close', () => clients.delete(s));
      }
      const pending = [];
      const deliver = (recipient, data) =>
        setTimeout(() => {
          if (recipient.readyState === WebSocket.OPEN) recipient.send(data, { binary: false });
        }, 38);
      front.on('message', (raw) => {
        if (back.readyState === WebSocket.OPEN) deliver(back, raw);
        else pending.push(raw);
      });
      back.on('open', () => {
        for (const message of pending) deliver(back, message);
      });
      back.on('message', (raw) => {
        const m = JSON.parse(raw);
        if (m.type === 'world') {
          bytes += raw.length;
          maxFrame = Math.max(maxFrame, raw.length);
          if (++snapshots % 100 === 0) {
            dropped++;
            return;
          }
        }
        deliver(front, raw);
      });
      front.on('close', () => back.close());
      back.on('close', () => front.close());
    });
  });
  const child = spawn(process.execPath, ['scripts/qa-coop-network.mjs', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, AEGIS_LOCAL_ORIGIN: siteOrigin, AEGIS_TEST_RELAY: endpoint },
  });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  assert.equal(warming, false, 'The host retried after the first connection was unavailable.');
  assert(dropped > 0, 'Deliver at least 100 world frames to exercise loss');
  console.log(
    'Secure relay: 152ms artificial round trip, ' +
      dropped +
      '/' +
      snapshots +
      ' world snapshots dropped; mean ' +
      Math.round(bytes / snapshots) +
      ' bytes, largest ' +
      maxFrame +
      ' bytes.',
  );
} finally {
  for (const s of services.reverse()) await s.close();
  await rm(dir, { recursive: true, force: true });
}
