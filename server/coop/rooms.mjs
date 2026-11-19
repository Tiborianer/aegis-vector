import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { createRoomHub, maxPayload, protocol } from './room-hub.mjs';
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
export function createRoomServer({
  scope = 'lan',
  root,
  lanBase,
  tls,
  origins = [],
  grace = 30000,
  inviteMs,
  maxRooms = 64,
} = {}) {
  const hub = createRoomHub({ grace, inviteMs, maxRooms });
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
  const ws = new WebSocketServer({ noServer: true, maxPayload, perMessageDeflate: false });
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
    if (req.url !== '/coop/socket' || !allowed || !hub.canAccept(ip)) {
      socket.destroy();
      return;
    }
    ws.handleUpgrade(req, socket, head, (client) => {
      const peer = hub.connect(client, ip);
      client.isAlive = true;
      client.on('pong', () => { client.isAlive = true; });
      client.on('error', () => {});
      client.on('message', (raw, binary) => peer.receive(binary ? undefined : raw.toString()));
      client.on('close', peer.disconnect);
    });
  });
  const cleanup = setInterval(() => {
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
      hub.shutdown();
      for (const s of ws.clients) s.terminate();
      ws.close();
      await new Promise((resolve) => http.close(resolve));
    },
  };
}
