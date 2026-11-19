import { connection, type WorldFrame } from './mirror';
import { element, type DeckView, type FlightDeck } from './panel';
import { squadInput, ACTIONS } from './input';
import { publicAssetUrl } from '../game/assets/publicAsset';

interface Screen {
  kind: string;
  title: string;
  detail: string;
  image?: string;
  time?: number;
}
interface NetHandlers {
  start: (resume: boolean) => void;
  world: (frame: WorldFrame) => void;
  screen: () => Screen;
  pause: (value?: boolean) => void;
  exit: () => void;
  unlock: () => void;
}
export class PrivateRooms {
  private socket?: WebSocket;
  private endpoint = '';
  private room = '';
  private seatKey = '';
  private retriesUntil = 0;
  private phase = '';
  private lastDeck?: DeckView;
  private lastScreen = '';
  private reconnectPaused = false;
  private syncTimer = 0;
  private resume = false;
  private inviteBase?: string;
  private generation = 0;
  private panel = element('section', 'coop-screen hidden');
  private status = element('p');
  private waiting?: HTMLElement;
  private guestScreen = '';
  private sameOriginService = false;
  private sharePage?: string;
  constructor(
    private deck: FlightDeck,
    private handlers: NetHandlers,
    shell: HTMLElement,
  ) {
    this.panel.id = 'coop-network-screen';
    shell.append(this.panel);
    deck.onView = (view) => {
      this.lastDeck = view;
      this.phase = 'deck';
      this.send({ type: 'deck', view });
    };
    deck.onGuestAction = (action) => {
      if (action.startsWith('choose:')) this.send({ type: 'choose', id: action.slice(7) });
    };
    connection.publish = (frame) => {
      if (this.handlers.screen().kind === 'flight') this.send({ type: 'world', frame });
    };
    squadInput.onRemote = (_seat, action, down) => {
      if (connection.role === 'guest') this.send({ type: 'input', action, down });
    };
    window.addEventListener(
      'keydown',
      (e) => {
        if (connection.role === 'guest' && ['Escape', 'KeyP'].includes(e.code)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!e.repeat) this.send({ type: 'pause' });
        }
      },
      true,
    );
    window.addEventListener('pagehide', () => {
      ++this.generation;
      this.socket?.close();
    });
    window.addEventListener('blur', () => {
      if (connection.role === 'host' && connection.connected && this.handlers.screen().kind === 'flight')
        this.handlers.pause(true);
    });
    for (const type of ['sound', 'music', 'radio', 'announce'])
      window.addEventListener('aegis:' + type, (e) => {
        if (connection.role === 'host' && connection.connected)
          this.send({ type, payload: (e as CustomEvent).detail });
      });
  }
  async controls(container: HTMLElement, hasSave: boolean): Promise<void> {
    this.waiting = container;
    container.replaceChildren();
    const hash = new URLSearchParams(location.hash.slice(1)),
      invite = hash.get('room');
    const base = new URL(location.href);
    base.hash = '';
    base.search = '';
    const defaultEndpoint = new URL('/coop/socket', base);
    defaultEndpoint.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    let endpoint = import.meta.env.VITE_COOP_RELAY || '';
    this.sameOriginService = false;
    // GitHub Pages serves the client at a project URL. LAN and combined internet hosts
    // advertise their room service from their own origin.
    if (!base.hostname.endsWith('.github.io')) {
      try {
        const r = await fetch(new URL('/coop/config', base), { cache: 'no-store' });
        const c = r.ok && r.headers.get('content-type')?.includes('application/json') ? await r.json() : {};
        if (c.protocol === 1 && c.scope === 'local') {
          container.append(element('p', '', 'For two computers on this Wi-Fi, open the Host LAN Co-op launcher.'));
          return;
        }
        if (c.protocol === 1) {
          this.sameOriginService = true;
          endpoint = defaultEndpoint.href;
          this.inviteBase = c.lanBase;
        }
      } catch {
        /* Static builds accept a configured relay. */
      }
    }
    const remote = element('input', 'coop-room-input');
    remote.type = 'url';
    remote.setAttribute('aria-label', 'Secure relay address');
    remote.placeholder = 'wss://your-relay/coop/socket';
    remote.value = hash.get('relay') || endpoint;
    const inviteInput = element('input', 'coop-room-input');
    inviteInput.placeholder = 'Paste a private invite link';
    inviteInput.setAttribute('aria-label', 'Private invite link');
    if (invite) inviteInput.value = location.href;
    const gamePage = element('input', 'coop-room-input');
    gamePage.type = 'url';
    gamePage.placeholder = 'https://game.example/';
    gamePage.setAttribute('aria-label', 'Public game address');
    gamePage.value = import.meta.env.VITE_COOP_GAME_URL || '';
    const advanced = element('details');
    advanced.append(
      element('summary', '', 'Internet relay address'),
      element('label', '', 'Secure relay address'),
      remote,
      element('label', '', 'Public game address when hosting from this computer'),
      gamePage,
    );
    const resume = element('input');
    resume.type = 'checkbox';
    resume.checked = hasSave;
    const resumeLabel = element('label');
    resumeLabel.append(resume, document.createTextNode(' Continue the host’s saved squad'));
    const commands = element('div', 'coop-menu');
    const make = element('button', 'secondary-button', 'Create private room');
    make.id = 'coop-create-room';
    const join = element('button', 'secondary-button', 'Join private room');
    join.id = 'coop-join-room';
    commands.append(make, join);
    const begin = (guest: boolean) => {
      try {
        this.handlers.unlock();
        let url = remote.value.trim() || endpoint,
          room = '';
        if (guest) {
          const raw = inviteInput.value.trim();
          if (/^[\w-]{24}$/.test(raw)) room = raw;
          else {
            const u = new URL(raw),
              params = new URLSearchParams(u.hash.slice(1));
            room = params.get('room') || '';
            const relay = params.get('relay');
            if (relay) url = relay;
            else {
              u.hash = '';
              u.pathname = '/coop/socket';
              u.search = '';
              u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
              url = u.href;
            }
          }
          if (!/^[\w-]{24}$/.test(room)) throw Error('Enter a complete invite link.');
        }
        if (!url)
          throw Error(
            'For LAN, open the game from the host launcher. For internet play, enter the secure relay address.',
          );
        const u = new URL(url);
        if (
          !['wss:', 'ws:'].includes(u.protocol) ||
          u.username ||
          u.password ||
          u.search ||
          u.hash ||
          (location.protocol === 'https:' && u.protocol !== 'wss:')
        )
          throw Error('Enter a WebSocket endpoint valid for this page.');
        if (u.protocol === 'ws:' && !(this.sameOriginService && u.href === defaultEndpoint.href))
          throw Error('Use a secure wss:// relay for internet rooms.');
        this.sameOriginService = this.sameOriginService && u.href === defaultEndpoint.href;
        this.sharePage = undefined;
        if (!guest && !this.sameOriginService) {
          const local = (host: string) =>
            /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]$)/.test(host);
          if (gamePage.value.trim()) {
            const page = new URL(gamePage.value.trim());
            if (page.protocol !== 'https:' || page.username || page.password)
              throw Error('Enter the public HTTPS game address.');
            this.sharePage = page.href;
          } else if (local(location.hostname) && !local(u.hostname))
            throw Error('Enter the public game address so your wingmate can open the invite.');
        }
        this.resume = resume.checked && hasSave;
        this.endpoint = u.href;
        this.room = room;
        this.seatKey = '';
        if (room)
          try {
            this.seatKey = sessionStorage.getItem('aegis-coop-seat:' + room) || '';
          } catch {}
        this.retriesUntil = 0;
        this.phase = 'waiting';
        // An idle hosted relay may take a minute to wake on its first request.
        this.connect(guest, this.sameOriginService ? 0 : Date.now() + 90_000);
      } catch (err) {
        this.status.textContent = (err as Error).message;
      }
    };
    const updateButtons = () => {
      make.disabled = !(remote.value.trim() || endpoint);
      join.disabled = !inviteInput.value.trim();
    };
    remote.addEventListener('input', updateButtons);
    inviteInput.addEventListener('input', updateButtons);
    updateButtons();
    make.onclick = () => begin(false);
    join.onclick = () => begin(true);
    container.append(element('h3', '', 'Private room'), inviteInput, commands);
    if (hasSave) container.append(resumeLabel);
    container.append(advanced, this.status);
    this.status.textContent = invite
      ? 'Invite ready. Join to take the wingmate seat.'
      : this.sameOriginService
        ? base.protocol === 'https:'
          ? 'Create a private internet invite for your wingmate.'
          : 'Guests on this Wi-Fi can open your invite in a browser.'
        : endpoint
          ? 'Create a room for a second computer on this Wi-Fi or over the internet.'
          : 'For two computers on home Wi-Fi, use the Host LAN Co-op launcher. Internet play needs a secure relay address.';
  }
  cancelWaiting(): void {
    if (connection.connected) return;
    ++this.generation;
    this.send({ type: 'leave' });
    this.socket?.close();
    this.socket = undefined;
    window.clearInterval(this.syncTimer);
    this.phase = '';
    connection.role = undefined;
    squadInput.onlineSeat = undefined;
  }
  guestPause(): void {
    this.send({ type: 'pause' });
  }
  private send(m: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      if ('type' in m && m.type === 'world' && this.socket.bufferedAmount > 256000) return;
      this.socket.send(JSON.stringify(m));
    }
  }
  private connect(guest: boolean, openingUntil = 0): void {
    const generation = ++this.generation;
    this.socket?.close();
    const ws = (this.socket = new WebSocket(this.endpoint));
    let acknowledged = false;
    const openingTimer = openingUntil
      ? window.setTimeout(() => {
          if (generation === this.generation && !acknowledged) ws.close();
        }, Math.max(0, openingUntil - Date.now()))
      : 0;
    this.status.textContent = openingUntil
      ? 'Connecting to the online room service. The first connection can take about a minute.'
      : 'Connecting…';
    ws.onopen = () => {
      if (generation !== this.generation) return;
      connection.role = guest ? 'guest' : 'host';
      this.send(guest ? { type: 'join', v: 1, room: this.room, seatKey: this.seatKey } : { type: 'create', v: 1 });
    };
    ws.onmessage = (event) => {
      if (generation !== this.generation) return;
      let m;
      try {
        m = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!m || typeof m !== 'object') return;
      if (!acknowledged && ['created', 'joined', 'error', 'ended'].includes(m.type)) {
        acknowledged = true;
        window.clearTimeout(openingTimer);
      }
      if (m.type === 'created') {
        this.room = m.room;
        const u = new URL(
          this.inviteBase && this.sameOriginService ? this.inviteBase : this.sharePage || location.href,
        );
        u.hash = '';
        u.search = '';
        const params = new URLSearchParams({ room: this.room });
        if (!this.sameOriginService) params.set('relay', this.endpoint);
        u.hash = params.toString();
        this.waiting?.replaceChildren(
          element('strong', '', 'Private invite · expires in 10 minutes'),
          this.status,
        );
        const copy = element('input', 'coop-room-input');
        copy.id = 'coop-invite';
        copy.readOnly = true;
        copy.value = u.href;
        copy.onclick = () => copy.select();
        this.waiting?.append(copy);
        this.status.textContent = 'Waiting for the second pilot. Share this link with your wingmate.';
      } else if (m.type === 'joined') {
        connection.connected = true;
        this.retriesUntil = 0;
        this.seatKey = m.seatKey;
        try {
          sessionStorage.setItem('aegis-coop-seat:' + this.room, this.seatKey);
        } catch {}
        squadInput.onlineSeat = 1;
        squadInput.active = true;
        document.getElementById('coop-lobby')?.classList.add('hidden');
        this.showGuest({ kind: 'waiting', title: 'Joining squadron', detail: 'The host is preparing your seat.' });
      } else if (m.type === 'partner' && !guest) {
        connection.connected = true;
        squadInput.onlineSeat = 0;
        squadInput.active = true;
        squadInput.clear();
        this.panel.classList.add('hidden');
        if (!m.returning) {
          this.handlers.start(this.resume);
          this.syncTimer = window.setInterval(() => this.updateScreen(), 200);
        } else {
          if (this.reconnectPaused) this.handlers.pause(false);
          this.reconnectPaused = false;
          this.updateScreen(true);
        }
      } else if (m.type === 'missing' && !guest) {
        const running = this.handlers.screen().kind === 'flight';
        connection.connected = false;
        squadInput.clear();
        this.reconnectPaused = running;
        if (running) this.handlers.pause(true);
        this.message('Wingmate disconnected', 'Holding the seat for 30 seconds.');
      } else if (m.type === 'error' || m.type === 'ended') {
        if (!guest && this.handlers.screen().kind === 'flight') this.handlers.pause(true);
        ++this.generation;
        connection.connected = false;
        this.retriesUntil = 0;
        window.clearInterval(this.syncTimer);
        this.socket?.close();
        squadInput.clear();
        if (this.phase === 'waiting' && m.type === 'error') {
          this.status.textContent = m.message;
          connection.role = undefined;
        } else this.message('Room closed', String(m.message).slice(0, 180), true);
      } else if (!guest && m.type === 'input' && ACTIONS.includes(m.action)) {
        squadInput.set(1, m.action, m.down);
      } else if (!guest && m.type === 'choose') {
        this.deck.choose(1, m.id);
      } else if (!guest && m.type === 'guest-pause') {
        this.handlers.pause();
      } else if (
        guest &&
        m.type === 'world' &&
        m.frame?.state?.squad?.pilots?.length === 2 &&
        Array.isArray(m.frame.items)
      ) {
        this.phase = 'flight';
        this.guestScreen = '';
        this.panel.classList.add('hidden');
        if (!this.deck.panel.classList.contains('hidden')) this.deck.hide();
        connection.receive?.(m.frame);
        this.handlers.world(m.frame);
      } else if (
        guest &&
        m.type === 'deck' &&
        m.view?.cards?.length === 2 &&
        m.view.cards.every((c: { choices: unknown[] }) => Array.isArray(c.choices) && c.choices.length <= 60)
      ) {
        this.phase = 'deck';
        this.guestScreen = '';
        this.panel.classList.add('hidden');
        this.deck.hud.classList.add('hidden');
        this.deck.remote(m.view);
      } else if (guest && m.type === 'story') {
        this.showGuest(m.screen);
      } else if (guest && ['sound', 'music', 'radio', 'announce'].includes(m.type)) {
        window.dispatchEvent(new CustomEvent('aegis:' + m.type, { detail: m.payload }));
      }
    };
    ws.onclose = () => {
      window.clearTimeout(openingTimer);
      if (generation !== this.generation) return;
      if (openingUntil && !acknowledged && Date.now() + 2500 < openingUntil) {
        window.setTimeout(() => {
          if (generation === this.generation) this.connect(guest, openingUntil);
        }, 2500);
        return;
      }
      if (!guest && this.handlers.screen().kind === 'flight') this.handlers.pause(true);
      connection.connected = false;
      squadInput.clear();
      if (guest && this.seatKey) {
        if (!this.retriesUntil) this.retriesUntil = Date.now() + 30000;
        if (Date.now() < this.retriesUntil) {
          this.message('Reconnecting', 'Restoring your wingmate seat…');
          setTimeout(() => {
            if (generation === this.generation) this.connect(true);
          }, 850);
          return;
        }
      }
      if (this.phase === 'waiting') {
        connection.role = undefined;
        this.status.textContent = 'Unable to connect to the private room.';
      } else this.message('Room disconnected', 'The host can resume the saved squad.', true);
    };
  }
  private updateScreen(force = false) {
    if (connection.role !== 'host' || !connection.connected) return;
    if (!this.deck.panel.classList.contains('hidden')) {
      if (force && this.lastDeck) this.send({ type: 'deck', view: this.lastDeck });
      return;
    }
    const screen = this.handlers.screen();
    this.phase = screen.kind;
    if (screen.kind === 'flight') {
      this.lastScreen = '';
      return;
    }
    const key = JSON.stringify({
      ...screen,
      time: screen.time === undefined ? undefined : Math.floor(screen.time),
    });
    if (force || key !== this.lastScreen) {
      this.lastScreen = key;
      this.send({ type: 'story', screen });
    }
  }
  private message(title: string, detail: string, end = false) {
    this.panel.classList.remove('hidden');
    this.panel.replaceChildren();
    const box = element('div', 'coop-wrap coop-lobby');
    box.append(element('h2', '', title), element('p', '', detail));
    if (end) {
      const b = element('button', 'secondary-button', 'Return to title');
      b.onclick = this.handlers.exit;
      box.append(b);
    }
    this.panel.append(box);
  }
  private showGuest(screen: Screen) {
    if (!screen || typeof screen.kind !== 'string') return;
    this.phase = screen.kind;
    this.deck.hide();
    this.deck.hud.classList.add('hidden');
    if (screen.kind === 'intro' && this.guestScreen === 'intro') {
      const video = this.panel.querySelector('video');
      if (video && Math.abs(video.currentTime - (screen.time || 0)) > 1.5) video.currentTime = screen.time || 0;
      return;
    }
    this.guestScreen = screen.kind;
    this.message(String(screen.title || 'Squadron'), String(screen.detail || ''));
    const box = this.panel.firstElementChild!;
    if (screen.kind === 'intro') {
      const v = element('video');
      v.src = publicAssetUrl('cinematics/video/aegis-vector-intro-v2.mp4');
      v.playsInline = true;
      v.muted = true;
      v.autoplay = true;
      v.currentTime = screen.time || 0;
      box.prepend(v);
    } else if (
      typeof screen.image === 'string' &&
      /^story(?:-v[2-6])?\/[a-z0-9/_-]+\.(?:webp|jpg|png)$/.test(screen.image)
    ) {
      const img = element('img');
      img.src = publicAssetUrl(screen.image);
      img.alt = 'Campaign transmission';
      box.prepend(img);
    }
    if (screen.kind === 'paused') {
      const b = element('button', 'secondary-button', 'Resume');
      b.onclick = () => this.send({ type: 'pause' });
      box.append(b);
    }
  }
}
