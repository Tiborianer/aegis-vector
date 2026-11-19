import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
const protocol = 1,
  inviteLifetime = 10 * 60_000;
const token = () => randomBytes(18).toString('base64url');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
const actions = new Set(['up', 'down', 'left', 'right', 'fire', 'emp']);
const hostMessages = new Set(['world', 'deck', 'announce', 'sound', 'music', 'radio', 'story']);
export function createRoomServer({
  scope = 'lan',
  root,
  lanBase,
  tls,
  origins = [],
  grace = 30000,
  inviteMs = inviteLifetime,
  maxRooms = 64,
} = {}) {
  const rooms = new Map(),
    peers = new Map(),
    counts = new Map();
  const serve = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://game.local');
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405).end();
        return;
      }
      if (url.pathname === '/coop/config') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(
          JSON.stringify({
            protocol,
            game: 'aegis-vector',
            scope,
            lanBase: /^(localhost|127\.0\.0\.1)(:|$)/.test(req.headers.host || '') ? lanBase : undefined,
          }),
        );
        return;
      }
      if (!root) {
        res.writeHead(404).end();
        return;
      }
      const base = await realpath(root),
        requested = decodeURIComponent(url.pathname);
      const file = await realpath(path.resolve(base, '.' + (requested === '/' ? '/index.html' : requested)));
      if (!file.startsWith(base + path.sep)) {
        res.writeHead(404).end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        res.writeHead(404).end();
        return;
      }
      const headers = {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Accept-Ranges': 'bytes',
      };
      let start = 0,
        end = info.size - 1,
        status = 200;
      if (req.headers.range) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!m || +m[1] >= info.size || (m[2] && +m[2] < +m[1])) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + info.size }).end();
          return;
        }
        start = +m[1];
        end = m[2] ? Math.min(end, +m[2]) : end;
        status = 206;
        headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + info.size;
      }
      res.writeHead(status, { ...headers, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    }
  };
  const http = tls ? createSecureServer(tls, serve) : createServer(serve);
  const ws = new WebSocketServer({ noServer: true, maxPayload: 384 * 1024, perMessageDeflate: false });
  const send = (s, m) => {
    if (s?.readyState === WebSocket.OPEN) s.send(JSON.stringify(m));
  };
  const fail = (s, reason) => {
    send(s, { type: 'error', message: reason });
    s.close(1008, 'Room unavailable');
  };
  function end(room, reason) {
    if (!rooms.delete(room.id)) return;
    clearTimeout(room.timer);
    for (const s of [room.host, room.guest])
      if (s) {
        send(s, { type: 'ended', message: reason });
        s.close(1000);
      }
  }
  http.on('upgrade', (req, socket, head) => {
    let allowed = false;
    try {
      const origin = new URL(req.headers.origin);
      allowed =
        origins.includes(origin.origin) ||
        (!origins.length && origin.host === req.headers.host && ['https:', 'http:'].includes(origin.protocol));
    } catch {
      /* Browser clients supply Origin. */
    }
    const ip = socket.remoteAddress;
    if (
      req.url !== '/coop/socket' ||
      !allowed ||
      ws.clients.size >= 2 * maxRooms + 24 ||
      (counts.get(ip) || 0) >= 20
    ) {
      socket.destroy();
      return;
    }
    ws.handleUpgrade(req, socket, head, (s) => {
      counts.set(ip, (counts.get(ip) || 0) + 1);
      s.on('close', () => {
        const n = (counts.get(ip) || 1) - 1;
        if (n) counts.set(ip, n);
        else counts.delete(ip);
      });
      ws.emit('connection', s);
    });
  });
  ws.on('connection', (s) => {
    let interval = Date.now(),
      count = 0;
    s.isAlive = true;
    s.on('pong', () => {
      s.isAlive = true;
    });
    s.on('error', () => {});
    const handshake = setTimeout(() => {
      if (!peers.has(s)) s.close(1008);
    }, 5000);
    handshake.unref();
    s.on('message', (raw, binary) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        fail(s, 'Invalid message');
        return;
      }
      if (binary || !m || typeof m !== 'object') {
        fail(s, 'Invalid message');
        return;
      }
      const now = Date.now();
      if (now - interval >= 1000) {
        interval = now;
        count = 0;
      }
      if (++count > 140) {
        fail(s, 'Too many messages');
        return;
      }
      let peer = peers.get(s);
      if (!peer) {
        if (m.v !== protocol) {
          fail(s, 'Both pilots need the same game version.');
          return;
        }
        if (m.type === 'create') {
          if (rooms.size >= maxRooms) {
            fail(s, 'Rooms are full.');
            return;
          }
          const room = {
            id: token(),
            host: s,
            expires: now + inviteMs,
            seatKey: token(),
            guest: undefined,
            claimed: false,
          };
          rooms.set(room.id, room);
          peers.set(s, { room, host: true });
          send(s, { type: 'created', room: room.id, expires: room.expires });
          return;
        }
        const room = rooms.get(m.room);
        if (
          m.type !== 'join' ||
          !room ||
          room.guest ||
          (!room.claimed && now > room.expires) ||
          (room.claimed && m.seatKey !== room.seatKey)
        ) {
          fail(s, 'Invite expired, room full, or seat unavailable.');
          return;
        }
        const returning = room.claimed;
        clearTimeout(room.timer);
        room.claimed = true;
        room.guest = s;
        peers.set(s, { room, host: false });
        send(s, { type: 'joined', seatKey: room.seatKey });
        send(room.host, { type: 'partner', returning });
        return;
      }
      const { room, host } = peer;
      if (m.type === 'leave') {
        end(room, 'The squadron closed the room.');
        return;
      }
      if (host && hostMessages.has(m.type)) {
        if (room.guest?.bufferedAmount > 768 * 1024 && m.type === 'world') return;
        if (room.guest?.bufferedAmount > 3 * 1024 * 1024) {
          room.guest.terminate();
          return;
        }
        send(room.guest, m);
        return;
      }
      if (!host && m.type === 'input' && actions.has(m.action) && typeof m.down === 'boolean')
        send(room.host, { type: 'input', action: m.action, down: m.down });
      else if (!host && m.type === 'choose' && typeof m.id === 'string' && /^[a-z0-9-]{1,55}$/.test(m.id))
        send(room.host, { type: 'choose', id: m.id });
      else if (!host && m.type === 'pause') send(room.host, { type: 'guest-pause' });
    });
    s.on('close', () => {
      clearTimeout(handshake);
      const peer = peers.get(s);
      peers.delete(s);
      if (!peer || !rooms.has(peer.room.id)) return;
      const room = peer.room;
      if (peer.host) {
        end(room, 'Host left. Progress is on the host computer.');
        return;
      }
      room.guest = undefined;
      send(room.host, { type: 'missing', grace });
      room.timer = setTimeout(() => end(room, 'Reconnect window ended. Resume from the host save.'), grace);
      room.timer.unref();
    });
  });
  const cleanup = setInterval(() => {
    for (const r of rooms.values()) if (!r.claimed && Date.now() > r.expires) end(r, 'The unused invite expired.');
    for (const s of ws.clients) {
      if (!s.isAlive) {
        s.terminate();
        continue;
      }
      s.isAlive = false;
      s.ping();
    }
  }, 15000);
  cleanup.unref();
  return {
    http,
    close: async () => {
      clearInterval(cleanup);
      for (const r of [...rooms.values()]) end(r, 'Server stopped.');
      for (const s of ws.clients) s.terminate();
      ws.close();
      await new Promise((resolve) => http.close(resolve));
    },
  };
}
