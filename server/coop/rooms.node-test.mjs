import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createRoomServer } from './rooms.mjs';

async function fixture(t, options = {}) {
  const service = createRoomServer({ grace: 200, inviteMs: 5000, ...options });
  service.http.listen(0, '127.0.0.1');
  await once(service.http, 'listening');
  t.after(() => service.close());
  const origin = 'http://127.0.0.1:' + service.http.address().port;
  const address = origin.replace('http:', 'ws:') + '/coop/socket';
  async function client() {
    const s = new WebSocket(address, { origin });
    const queue = [],
      waiters = [];
    s.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (waiters.length) waiters.shift()(message);
      else queue.push(message);
    });
    await once(s, 'open');
    return {
      s,
      send: (m) => s.send(JSON.stringify(m)),
      next: () =>
        queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiters.push(resolve)),
    };
  }
  async function create() {
    const host = await client();
    host.send({ type: 'create', v: 1 });
    return { host, id: (await host.next()).room };
  }
  async function join(id, seatKey) {
    const guest = await client();
    guest.send({ type: 'join', room: id, seatKey, v: 1 });
    return guest;
  }
  return { origin, address, create, client, join };
}
test(
  'private room protects each seat, relays the actual inputs and returns the same guest after reconnect',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    const { host, id } = await f.create();
    const guest = await f.join(id);
    const { seatKey } = await guest.next();
    assert.equal((await host.next()).returning, false);
    const third = await f.join(id);
    assert.equal((await third.next()).type, 'error');
    guest.send({ type: 'world', frame: { score: 999 } });
    guest.send({ type: 'input', action: 'fire', down: true, seat: 0 });
    assert.deepEqual(await host.next(), { type: 'input', action: 'fire', down: true });
    host.send({ type: 'announce', payload: 'Waypoint secured' });
    assert.equal((await guest.next()).payload, 'Waypoint secured');
    guest.s.close();
    assert.equal((await host.next()).type, 'missing');
    const intruder = await f.join(id);
    assert.equal((await intruder.next()).type, 'error');
    const back = await f.join(id, seatKey);
    assert.equal((await back.next()).seatKey, seatKey);
    assert.equal((await host.next()).returning, true);
    host.s.close();
    assert.equal((await back.next()).type, 'ended');
  },
);
test(
  'expired invitations, incompatible clients and unapproved origins cannot enter a private room',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t, { inviteMs: 10 });
    const { id } = await f.create();
    await new Promise((r) => setTimeout(r, 20));
    const late = await f.join(id);
    assert.equal((await late.next()).type, 'error');
    const old = await f.client();
    old.send({ type: 'create', v: 99 });
    assert.equal((await old.next()).type, 'error');
    const foreign = new WebSocket(f.address, { origin: 'https://unrelated.example' });
    await once(foreign, 'error');
    assert.equal((await fetch(f.origin + '/package.json')).status, 404);
  },
);
test(
  'room closes after the reconnect deadline, and is available only to its original two pilots',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t, { grace: 30, maxRooms: 1 });
    const { id, host } = await f.create();
    const other = await f.client();
    other.send({ type: 'create', v: 1 });
    assert.equal((await other.next()).type, 'error');
    const guest = await f.join(id);
    const { seatKey } = await guest.next();
    await host.next();
    guest.s.close();
    assert.equal((await host.next()).type, 'missing');
    assert.equal((await host.next()).type, 'ended');
    const expired = await f.join(id, seatKey);
    assert.equal((await expired.next()).type, 'error');
  },
);
