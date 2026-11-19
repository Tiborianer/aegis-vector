import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const publicRelay = process.env.AEGIS_EXPECT_PUBLIC_RELAY;
const origin = new URL(publicRelay ? 'https://tiborianer.github.io/aegis-vector/'
  : process.env.AEGIS_LOCAL_ORIGIN || 'http://127.0.0.1:4216');
if (publicRelay) assert.equal(new URL(publicRelay).protocol, 'wss:');
else assert(['localhost', '127.0.0.1'].includes(origin.hostname), 'Use a locally staged game.');
const out = path.resolve(process.argv[2] || 'outputs/quality/wingmate-arc');
await mkdir(out, { recursive: true });
const chrome = await chromium.launch({ channel: 'chrome', args: [
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
] });
const guestBrowser = process.env.AEGIS_GUEST_ENGINE === 'webkit' ? await webkit.launch() : chrome;
const errors = [], confirmations = [], inputs = [];
const oneWayMs = 300;

async function pilot(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Expose the existing game only inside these test pages. The staged build has no test endpoint.
  await context.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), source = await response.text();
    const constructor = /\bnew [\w$]+\.Game\([\w$]+\)(?=;)/g;
    assert.equal([...source.matchAll(constructor)].length, 1);
    await route.fulfill({ response, body: source.replace(constructor, 'window.arcTestGame=$&') });
  });
  await context.addInitScript(live => {
    const q = window.arcTest = { down: [], audio: [], cues: [], tones: [], frames: {}, muzzles: [], echoedImages: [], replies: [] };
    const now = () => performance.timeOrigin + performance.now();
    if (live) {
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', e => {
            const m = JSON.parse(e.data);
            if (m.type === 'sound' && m.payload?.wingArc) q.replies.push({ id: m.payload.wingArc, time: now() });
          });
        }
      };
    }
    const edges = new WeakMap();
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(...args) {
      const children = edges.get(this) || [];
      children.push(args[0]); edges.set(this, children);
      return connect.apply(this, args);
    };
    const leadsToOutput = (node, output, seen = new Set()) => {
      if (node === output) return true;
      if (!node || seen.has(node)) return false;
      seen.add(node);
      return (edges.get(node) || []).some(child => leadsToOutput(child, output, seen));
    };
    let sound;
    window.addEventListener('aegis:sound', e => {
      const cue = e.detail?.cue || e.detail;
      q.cues.push(cue);
      sound = cue === 'arc-fire' ? { id: e.detail.wingArc || 'lead', time: now() } : undefined;
      if (sound) q.audio.push(sound);
      queueMicrotask(() => { sound = undefined; });
    }, true);
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function(...args) {
      if (sound && this.type === 'square') {
        const gain = edges.get(this)?.[0];
        const sample = { id: sound.id, time: now(), peak: 0,
          output: this.context.state === 'running' && leadsToOutput(gain, this.context.destination) };
        q.tones.push(sample);
        if (gain) {
          const meter = this.context.createAnalyser(), data = new Float32Array(1024);
          meter.fftSize = 1024; gain.connect(meter);
          for (const ms of [12, 26, 42, 65, 90]) setTimeout(() => {
            meter.getFloatTimeDomainData(data);
            for (const value of data) sample.peak = Math.max(sample.peak, Math.abs(value));
            if (ms === 90) gain.disconnect(meter);
          }, ms);
        }
      }
      return start.apply(this, args);
    };
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !e.repeat) q.down.push(now());
    }, true);
    window.addEventListener('aegis:state', e => { if (e.detail?.squad) q.state = e.detail; });
    q.observeGuest = () => {
      const scene = window.arcTestGame.scene.keys.battle;
      const muzzle = scene.weaponMuzzle.bind(scene);
      scene.weaponMuzzle = (...args) => {
        const flash = muzzle(...args);
        q.muzzles.push({ flash, time: now() });
        return flash;
      };
      window.arcTestGame.events.on('postrender', () => {
        const camera = scene.cameras.main;
        for (const [id, volley] of scene.mirror.arc.volleys) {
          if (q.frames[id]) continue;
          const bolts = volley.bolts.map(b => b.image).filter(b => b?.visible && b.willRender(camera));
          if (bolts.length) q.frames[id] = { time: now(), count: bolts.length,
            angles: bolts.map(b => b.rotation), textures: bolts.map(b => b.texture.key),
            cosmetic: bolts.every(b => !b.body), flash: q.muzzles.some(m => m.flash.active && m.flash.willRender(camera)) };
        }
        for (const { item } of scene.mirror.objects.values())
          if (item.arc && q.frames[item.arc[0]]) q.echoedImages.push(item.arc[0]);
      });
    };
  }, Boolean(publicRelay));
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  page.on('pageerror', e => errors.push(e.message));
  return page;
}

const readHost = page => page.evaluate(() => {
  const s = window.arcTestGame.scene.keys.battle;
  return { volleys: s.wing.primaryVolleyIndex, hits: s.wing.model.shotsHit,
    health: window.arcTest.target?.getData('health'), score: s.teamSnapshot().score };
});
const rounded = ms => Math.round(ms * 10) / 10;
const median = arr => [...arr].sort((a,b) => a-b)[Math.floor(arr.length / 2)];
const timerHandles = new Set();

async function startRoom(host, guest) {
  await host.goto(new URL('#two-pilots', origin).href);
  if (publicRelay) assert.equal(await host.getByLabel('Secure relay address', { exact: true }).inputValue(), publicRelay);
  await host.locator('#coop-create-room').click();
  const invite = new URL(await host.locator('#coop-invite').inputValue({ timeout: publicRelay ? 100000 : 18000 }));
  if (publicRelay) {
    assert.equal(invite.origin + invite.pathname, origin.href);
    assert.equal(new URLSearchParams(invite.hash.slice(1)).get('relay'), publicRelay);
  }
  await guest.goto(publicRelay ? invite.href : new URL(invite.hash, origin).href);
  await guest.locator('#coop-join-room').click();
  await guest.locator('[data-seat="1"] [data-choice="ready"]').click();
  await host.locator('[data-seat="0"] [data-choice="ready"]').click();
  await host.locator('#intro-skip-button').click();
  for (const p of [host, guest]) await p.waitForFunction(() => window.arcTest.state?.mode === 'playing');
  await guest.evaluate(() => window.arcTest.observeGuest());
}

async function publicFlight(host, guest) {
  const release = await (await host.request.get(new URL('release.json', origin).href)).json();
  if (process.env.AEGIS_EXPECT_REVISION) assert.equal(release.revision, process.env.AEGIS_EXPECT_REVISION);
  await startRoom(host, guest);
  const shots = 8;
  for (let i = 0; i < shots; i++) {
    await guest.keyboard.press('Space');
    await guest.waitForFunction(n => Object.keys(window.arcTest.frames).length > n, i);
    if (!i) await guest.screenshot({ path: path.join(out, 'live-wingmate.jpg'), quality: 85 });
    await guest.waitForFunction(n => window.arcTest.replies.length > n, i);
    await delay(175);
  }
  const data = await guest.evaluate(() => {
    const { frames, tones, down, replies, echoedImages, muzzles } = window.arcTest;
    return { frames, tones, down, replies, echoedImages, flashes: muzzles.length };
  });
  const ids = Object.keys(data.frames);
  assert.equal(ids.length, shots);
  assert.equal((await readHost(host)).volleys, shots);
  assert.deepEqual(data.replies.map(x => x.id), ids);
  assert.deepEqual(data.tones.map(x => x.id), ids);
  assert(data.tones.every(x => x.output && x.peak > 0.001));
  assert.equal(data.echoedImages.length, 0);
  assert.equal(data.flashes, shots);
  const visuals = ids.map((id, i) => data.frames[id].time - data.down[i]);
  const sounds = data.tones.map((t, i) => t.time - data.down[i]);
  const reply = data.replies.map((t, i) => t.time - data.down[i]);
  assert(Math.max(...visuals, ...sounds) < 100);
  assert(visuals.every((v, i) => v < reply[i]));
  assert.deepEqual(errors, []);
  const result = { revision: release.revision, engine: guestBrowser === chrome ? 'Chrome' : 'WebKit',
    volleys: shots, visualMedianMs: rounded(median(visuals)), audioMedianMs: rounded(median(sounds)),
    maxFeedbackMs: rounded(Math.max(...visuals, ...sounds)), confirmationMedianMs: rounded(median(reply)),
    allWaveformsReachedOutput: true, doubleSounds: 0, doubleVisuals: 0 };
  await writeFile(path.join(out, 'results.json'), JSON.stringify({ result, visuals, sounds, reply }, null, 2));
  console.log(JSON.stringify(result));
}

async function delayedFlight(host, guest) {
  let upstreamBlocked = false;
  const waiting = [];
  const later = fn => {
    const timer = setTimeout(() => { timerHandles.delete(timer); fn(); }, oneWayMs);
    timerHandles.add(timer);
  };
  await guest.routeWebSocket('**/coop/socket', route => {
    const service = route.connectToServer();
    route.onMessage(data => {
      const m = JSON.parse(data);
      if (m.type === 'input') {
        inputs.push(m);
        const send = () => service.send(data);
        if (upstreamBlocked) waiting.push(send); else later(send);
      } else if (m.type === 'join') service.send(data);
      else later(() => service.send(data));
    });
    service.onMessage(data => {
      const m = JSON.parse(data);
      // Delay every message in order: WebSocket never lets a later pause overtake a flight frame.
      later(() => {
        if (m.type === 'sound' && m.payload?.wingArc) confirmations.push({ id: m.payload.wingArc, time: Date.now() });
        route.send(data);
      });
    });
  });
  await startRoom(host, guest);
  // A stationary scout and the standard ARC alone make each actual hit or miss unambiguous.
  // Firing, projectile physics, hit zones, damage, scoring and both renderers run normally.
  await host.evaluate(() => {
    const s = window.arcTestGame.scene.keys.battle;
    s.updateWaveDirector = () => {};
    s.wing.model.weapons.drone = s.wing.model.weapons.laser = 0;
    s.wing.model.weapons.spread = 1;
    const e = s.spawnEnemy('scout', s.wing.player.x, s.wing.player.y - 190, 0);
    e.setData('health', 30).setData('maxHealth', 30).setVelocity(0);
    e.body.moves = false;
    s.updateEnemies = () => s.syncEnemyHitZones(e);
    window.arcTest.target = e;
  });
  await delay(420);
  const before = await readHost(host);
  upstreamBlocked = true;
  await guest.keyboard.press('Space');
  await guest.waitForFunction(() => Object.keys(window.arcTest.frames).length === 1);
  await guest.screenshot({ path: path.join(out, 'guest-first-shot.jpg'), quality: 85 });
  await delay(220);
  assert.deepEqual(await readHost(host), before, 'A local bolt cannot fire the host gun, damage the target, or score.');
  assert.equal(await guest.evaluate(() => window.arcTest.state.shotsHit), before.hits);
  // Move the real target clear after the guest saw its own bolt cross the old position.
  await host.evaluate(() => {
    const s = window.arcTestGame.scene.keys.battle, e = window.arcTest.target;
    e.setX(s.wing.player.x - 280); s.syncEnemyHitZones(e);
  });
  upstreamBlocked = false; waiting.splice(0).forEach(send => send());
  await host.waitForFunction(() => window.arcTestGame.scene.keys.battle.wing.primaryVolleyIndex === 1);
  await delay(900);
  assert.equal((await readHost(host)).hits, before.hits, 'The host rules the first shot a miss.');
  assert.equal((await readHost(host)).health, before.health);
  await host.evaluate(() => {
    const s = window.arcTestGame.scene.keys.battle, e = window.arcTest.target;
    e.setX(s.wing.player.x); s.syncEnemyHitZones(e);
  });
  await delay(360);
  for (let i = 0; i < 5; i++) { await guest.keyboard.press('Space'); await delay(820); }
  const hits = await readHost(host);
  assert.equal(hits.hits - before.hits, 5);
  assert(hits.health < before.health);
  assert.equal(await guest.evaluate(() => window.arcTest.state.shotsHit), hits.hits);
  const prior = await guest.evaluate(() => window.arcTest.tones.length);
  await Promise.all([guest.keyboard.down('Space'), host.keyboard.down('Space')]);
  await delay(665);
  await Promise.all([guest.keyboard.up('Space'), host.keyboard.up('Space')]);
  await delay(1050);
  const data = await guest.evaluate(() => ({
    down: window.arcTest.down, frames: window.arcTest.frames, audio: window.arcTest.audio,
    tones: window.arcTest.tones, echoedImages: window.arcTest.echoedImages, flashes: window.arcTest.muzzles.length,
  }));
  const ids = Object.keys(data.frames);
  const wingTones = data.tones.filter(t => t.id !== 'lead');
  assert.deepEqual([...confirmations.map(a => a.id)].sort(), [...ids].sort(), 'Every host volley matched one local launch.');
  assert.deepEqual(wingTones.map(t => t.id), ids, 'Exactly one rendered sound for each guest volley.');
  assert(wingTones.every(t => t.output && t.peak > 0.001), 'Every shot generated a waveform on a path to the audio output.');
  assert(data.tones.slice(prior).some(t => t.id === 'lead'), 'Simultaneous host fire remains audible.');
  assert.equal(data.flashes, ids.length);
  assert.equal(data.echoedImages.length, 0, 'No second sprite or flash on confirmation.');
  assert(Object.values(data.frames).every(f => f.cosmetic && f.flash && f.count === 1));
  assert(ids.length >= 10, 'Held fire repeated at the gun cadence.');
  const isolated = ids.slice(0, 6);
  const visuals = isolated.map((id, i) => data.frames[id].time - data.down[i]);
  const sounds = isolated.map((id, i) => wingTones.find(t => t.id === id).time - data.down[i]);
  const delays = isolated.slice(1).map((id, i) => confirmations.find(c => c.id === id).time - data.down[i+1]);
  assert(Math.max(...visuals, ...sounds) < 100);
  assert(delays.every(ms => ms >= 550));
  assert(inputs.every(m => Object.keys(m).sort().join(',') === 'action,down,type'));
  await host.screenshot({ path: path.join(out, 'host-confirmed.jpg'), quality: 85 });

  await host.evaluate(() => {
    const s = window.arcTestGame.scene.keys.battle;
    s.wing.model.weapons.spread = 3;
    s.wing.model.weapons.missile = 1;
    s.wing.model.modifiers.splitCapacitors = true;
    s.wing.model.overdriveUntil = s.wing.model.stageElapsedMs + 10000;
  });
  await guest.waitForFunction(() => {
    const f = window.arcTestGame.scene.keys.battle.mirror.frame;
    return f.state.squad.pilots[1].weapons.spread === 3 && f.wingArc.split && f.wingArc.overdrive;
  });
  upstreamBlocked = true;
  const cueCount = await guest.evaluate(() => window.arcTest.cues.length);
  await guest.keyboard.down('Space');
  await guest.waitForFunction(n => Object.keys(window.arcTest.frames).length === n + 1, ids.length);
  await guest.screenshot({ path: path.join(out, 'guest-upgraded-volley.jpg'), quality: 85 });
  const upgrade = await guest.evaluate(() => Object.values(window.arcTest.frames).at(-1));
  assert.equal(upgrade.count, 4);
  assert.deepEqual(upgrade.angles.map(a => rounded(a)), [-0.1, 0, 0.1, 0]);
  assert(upgrade.textures.every(key => /overdrive/i.test(key)));
  assert.equal(await guest.evaluate(n => window.arcTest.cues.slice(n).includes('nova-fire'), cueCount), false);
  // Keep the real fire button held long enough for the secondary cannon's normal host simulation.
  upstreamBlocked = false; waiting.splice(0).forEach(send => send());
  await delay(220);
  await guest.keyboard.up('Space');
  await guest.waitForFunction(n => window.arcTest.cues.slice(n).includes('nova-fire'), cueCount);
  await delay(650);

  await guest.keyboard.press('p');
  await host.locator('#pause-screen').waitFor();
  await guest.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  const paused = await guest.evaluate(() => [Object.keys(window.arcTest.frames).length, window.arcTest.audio.length]);
  await guest.keyboard.press('Space');
  await delay(400);
  assert.deepEqual(await guest.evaluate(() => [Object.keys(window.arcTest.frames).length, window.arcTest.audio.length]), paused);
  await guest.getByRole('button', { name: 'Resume', exact: true }).click();
  await host.locator('#pause-screen').waitFor({ state: 'hidden' });
  await host.evaluate(() => { window.arcTestGame.scene.keys.battle.wing.down = true; });
  await guest.waitForFunction(() => window.arcTest.state.squad.pilots[1].down);
  const downed = await readHost(host);
  await guest.keyboard.press('Space'); await delay(700);
  assert.equal((await readHost(host)).volleys, downed.volleys);
  assert.deepEqual(await guest.evaluate(() => [Object.keys(window.arcTest.frames).length, window.arcTest.audio.length]), paused);
  assert.deepEqual(errors, []);
  const result = { engine: guestBrowser === chrome ? 'Chrome' : 'WebKit', simulatedOneWayMs: oneWayMs,
    volleys: ids.length, singleTaps: isolated.length, visualMedianMs: rounded(median(visuals)),
    audioMedianMs: rounded(median(sounds)), maxFeedbackMs: rounded(Math.max(...visuals, ...sounds)),
    confirmationMedianMs: rounded(median(delays)), firstMiss: true, confirmedHits: hits.hits - before.hits,
    hurtBeforeInputDelivery: false, doubleSounds: 0, doubleVisuals: 0, allWaveformsReachedOutput: true,
    upgradedPellets: upgrade.count, secondaryWaitedForHost: true, pausedAndDownedSilent: true };
  await writeFile(path.join(out, 'results.json'), JSON.stringify({ result, visuals, sounds, delays }, null, 2));
  console.log(JSON.stringify(result));
}

try {
  const host = await pilot(chrome), guest = await pilot(guestBrowser);
  if (publicRelay) await publicFlight(host, guest);
  else await delayedFlight(host, guest);
} finally {
  timerHandles.forEach(clearTimeout);
  if (guestBrowser !== chrome) await guestBrowser.close();
  await chrome.close();
}
