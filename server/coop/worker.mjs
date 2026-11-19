import { DurableObject } from 'cloudflare:workers';
import { createRoomHub, maxPayload, protocol } from './room-hub.mjs';

const encoder = new TextEncoder();

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/coop/config') {
      return Response.json({ game: 'aegis-vector', protocol, scope: 'internet' }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (pathname !== '/coop/socket') return new Response('Not found', { status: 404 });
    if (request.headers.get('Origin') !== env.GAME_ORIGIN) {
      return new Response('Game origin required', { status: 403 });
    }
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }
    // Both pilots connect to the same URL before sending their private room handshake.
    return env.ROOMS.getByName('aegis-vector').fetch(request);
  },
};

export class PrivateRooms extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.hub = createRoomHub();
  }

  fetch(request) {
    const address = request.headers.get('CF-Connecting-IP') || 'local';
    if (!this.hub.canAccept(address)) return new Response('Rooms busy', { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    // A standard accepted socket keeps live matches in memory until their pilots leave.
    server.accept();
    const peer = this.hub.connect(server, address);
    server.addEventListener('message', ({ data }) => {
      if (typeof data === 'string' && encoder.encode(data).byteLength > maxPayload) {
        server.close(1009, 'Message too large');
        return;
      }
      peer.receive(data);
    });
    server.addEventListener('close', peer.disconnect);
    server.addEventListener('error', peer.disconnect);
    return new Response(null, { status: 101, webSocket: client });
  }
}
