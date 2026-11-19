import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';

const base = new URL(process.argv[2]);
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
if (base.protocol !== 'https:' && !(loopback && base.protocol === 'http:'))
  throw Error('Use the HTTPS room service address or a local test server.');
const endpoint = new URL('/coop/socket', base);
endpoint.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
const origin = 'https://tiborianer.github.io';
const health = await fetch(new URL('/coop/config', base), { signal: AbortSignal.timeout(90_000) });
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { game: 'aegis-vector', scope: 'internet', protocol: 1 });

const clients = new Set();
const deadline = AbortSignal.timeout(25_000);
async function connect() {
  const socket = new WebSocket(endpoint, { origin, handshakeTimeout: 10_000 });
  clients.add(socket);
  await once(socket, 'open', { signal: deadline });
  return socket;
}
async function next(socket) {
  const [raw] = await once(socket, 'message', { signal: deadline });
  return JSON.parse(raw);
}
function send(socket, message) {
  socket.send(JSON.stringify(message));
}
async function exchange(socket, message) {
  const reply = next(socket);
  send(socket, message);
  return reply;
}

try {
  const host = await connect();
  const created = await exchange(host, { type: 'create', v: 1 });
  assert.equal(created.type, 'created');
  assert.ok(typeof created.room === 'string' && /^[\w-]{24}$/.test(created.room), 'Invite has the expected format.');
  const guest = await connect();
  const partner = next(host);
  const joined = await exchange(guest, { type: 'join', v: 1, room: created.room });
  assert.equal(joined.type, 'joined');
  assert.equal((await partner).type, 'partner');
  const fire = next(host);
  send(guest, { type: 'input', action: 'fire', down: true });
  assert.deepEqual(await fire, { type: 'input', action: 'fire', down: true });
  const announcement = next(guest);
  send(host, { type: 'announce', payload: 'Flight ready' });
  assert.equal((await announcement).payload, 'Flight ready');

  const missing = next(host);
  guest.close();
  assert.equal((await missing).type, 'missing');
  const returningGuest = await connect();
  const returningHost = next(host);
  const rejoined = await exchange(returningGuest, {
    type: 'join', v: 1, room: created.room, seatKey: joined.seatKey,
  });
  assert.equal(rejoined.type, 'joined');
  assert.equal((await returningHost).returning, true);
  const closed = next(returningGuest);
  send(host, { type: 'leave' });
  assert.equal((await closed).type, 'ended');
  console.log('Room service passed: health, private invite, both directions of play, reconnect and room closure.');
} finally {
  for (const socket of clients) socket.terminate();
}
