// The LAN server and the hosted Worker speak the same room protocol.
export const protocol = 1;
export const maxPayload = 384 * 1024;
const actions = new Set(['up', 'down', 'left', 'right', 'fire', 'emp']);
const hostMessages = new Set(['world', 'deck', 'announce', 'sound', 'music', 'radio', 'story']);

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_');
}

function send(socket, message) {
  if (socket?.readyState === 1) socket.send(JSON.stringify(message));
}

function reject(socket, message) {
  send(socket, { type: 'error', message });
  socket.close(1008, 'Room unavailable');
}

export function createRoomHub({ grace = 30_000, inviteMs = 600_000, maxRooms = 64 } = {}) {
  const rooms = new Map();
  const connectionsByAddress = new Map();
  let connectionCount = 0;

  function canAccept(address) {
    return connectionCount < 2 * maxRooms + 24 && (connectionsByAddress.get(address) || 0) < 20;
  }

  function end(room, message) {
    if (!rooms.delete(room.id)) return;
    clearTimeout(room.timer);
    for (const socket of [room.host, room.guest]) {
      if (socket && socket.readyState === 1) {
        send(socket, { type: 'ended', message });
        socket.close(1000, 'Room closed');
      }
    }
  }

  function admit(socket, message) {
    if (message.v !== protocol) return reject(socket, 'Both pilots need the same game version.');
    if (message.type === 'create') {
      if (rooms.size >= maxRooms) return reject(socket, 'Rooms are full.');
      const room = {
        id: token(), host: socket, guest: undefined, seatKey: token(),
        claimed: false, expires: Date.now() + inviteMs, timer: undefined,
      };
      rooms.set(room.id, room);
      room.timer = setTimeout(() => end(room, 'The unused invite expired.'), inviteMs);
      send(socket, { type: 'created', room: room.id, expires: room.expires });
      return room;
    }
    const room = rooms.get(message.room);
    if (message.type !== 'join' || !room || room.guest ||
      (room.claimed ? message.seatKey !== room.seatKey : Date.now() >= room.expires)) {
      return reject(socket, 'Invite expired, room full, or seat unavailable.');
    }
    const returning = room.claimed;
    clearTimeout(room.timer);
    room.claimed = true;
    room.guest = socket;
    send(socket, { type: 'joined', seatKey: room.seatKey });
    send(room.host, { type: 'partner', returning });
    return room;
  }

  function relay(room, socket, message) {
    if (message.type === 'leave') return end(room, 'The squadron closed the room.');
    if (socket === room.host) {
      if (!hostMessages.has(message.type)) return;
      const queued = room.guest?.bufferedAmount || 0;
      if (queued > 768 * 1024 && message.type === 'world') return;
      if (queued > 3 * 1024 * 1024) {
        if (room.guest.terminate) room.guest.terminate();
        else room.guest.close(1013, 'Connection is too slow');
        return;
      }
      send(room.guest, message);
    } else if (message.type === 'input' && actions.has(message.action) && typeof message.down === 'boolean') {
      send(room.host, { type: 'input', action: message.action, down: message.down });
    } else if (message.type === 'choose' && typeof message.id === 'string' && /^[a-z0-9-]{1,55}$/.test(message.id)) {
      send(room.host, { type: 'choose', id: message.id });
    } else if (message.type === 'pause') {
      send(room.host, { type: 'guest-pause' });
    }
  }

  function connect(socket, address) {
    connectionsByAddress.set(address, (connectionsByAddress.get(address) || 0) + 1);
    connectionCount++;
    let room, disconnected = false, interval = Date.now(), count = 0;
    const handshake = setTimeout(() => socket.close(1008, 'Room handshake timed out'), 5000);

    function receive(text) {
      if (disconnected || socket.readyState !== 1) return;
      let message;
      try {
        message = typeof text === 'string' && JSON.parse(text);
      } catch {
        return reject(socket, 'Invalid message');
      }
      if (!message || typeof message !== 'object') return reject(socket, 'Invalid message');
      const now = Date.now();
      if (now - interval >= 1000) { interval = now; count = 0; }
      if (++count > 140) return reject(socket, 'Too many messages');
      if (!room) {
        clearTimeout(handshake);
        room = admit(socket, message);
      } else if (rooms.has(room.id)) {
        relay(room, socket, message);
      }
    }

    function disconnect() {
      if (disconnected) return;
      disconnected = true;
      connectionCount--;
      const remaining = connectionsByAddress.get(address) - 1;
      if (remaining) connectionsByAddress.set(address, remaining);
      else connectionsByAddress.delete(address);
      clearTimeout(handshake);
      if (!room || !rooms.has(room.id)) return;
      if (room.host === socket) return end(room, 'Host left. Progress is on the host computer.');
      room.guest = undefined;
      send(room.host, { type: 'missing', grace });
      room.timer = setTimeout(() => end(room, 'Reconnect window ended. Resume from the host save.'), grace);
    }
    return { receive, disconnect };
  }

  function shutdown() {
    for (const room of rooms.values()) end(room, 'Server stopped.');
  }
  return { canAccept, connect, shutdown };
}
