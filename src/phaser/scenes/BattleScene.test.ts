import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: { Scene: class {}, BlendModes: { ADD: 1 }, Core: { Events: { BLUR: 'blur' } }, Scenes: { Events: { PAUSE: 'pause', SLEEP: 'sleep', SHUTDOWN: 'shutdown' } }, Input: { Keyboard: { KeyCodes: new Proxy({}, { get: (_target, key) => key }) } }, Math: {
  Clamp: (value: number, low: number, high: number) => Math.max(low, Math.min(high, value)),
  Between: (low: number, high: number) => Math.floor((low + high) / 2),
  FloatBetween: (low: number, high: number) => (low + high) / 2,
  DegToRad: (value: number) => value * Math.PI / 180,
  Angle: { Between: (x: number, y: number, x2: number, y2: number) => Math.atan2(y2 - y, x2 - x) },
  Linear: (start: number, end: number, amount: number) => start + (end - start) * amount,
  Distance: {
    Between: (x: number, y: number, x2: number, y2: number) => Math.hypot(x2 - x, y2 - y),
    Squared: (x: number, y: number, x2: number, y2: number) => (x2 - x) ** 2 + (y2 - y) ** 2,
  },
} } }));
import { BattleScene } from './BattleScene';
import { getMissionById } from '../../game/content/missions';
import { buildCombatModifiers } from '../../game/content/upgrades';
import { applyRouteReward } from '../../game/content/routeRewards';
import { auroraWave, EncounterDirector, globalCarrierIndex } from '../../game/content/encounters';
import { chooseArmamentOffer } from '../../game/content/pickups';
import { ASSET_KEYS } from '../../game/assets/manifest';
import { ENEMIES, MAX_ACTIVE_ENEMIES } from '../../game/content/balance';
import { HOSTILE_PROJECTILE_ART } from '../../game/assets/hostileProjectiles';
import { activeTurretCount, buildTurretVolley, createModularBoss, siegeTurretPose, SIEGE_TURRET_TURN_RATE, type ModularBossState } from '../../game/simulation/modularBoss';
import type { EnemyKind, MissionId, MissionStartConfig, MissionWaypointSnapshot, UpgradeType } from '../../game/simulation/types';

const config = (missionId: MissionId): MissionStartConfig => ({
  mission: getMissionById(missionId), difficulty: 'pilot', score: 0,
  weapons: { spread: 1, missile: 0, laser: 0, drone: 0, ion: 0 }, shieldBaseMax: 1,
  modifiers: buildCombatModifiers([]), campaignSeed: 42,
});

describe('Mission Lab God-mode switching', () => {
  it('rereads the lab checkbox on each in-place mission launch', () => {
    const scene = harness('coastal');
    installStartViews(scene);
    window.location.search = '?lab=1';
    scene['startMission'](config('coastal'));
    expect(scene['godMode']).toBe(true);
    window.location.search = '?lab=1&god=0';
    scene['startMission'](config('coastal'));
    expect(scene['godMode']).toBe(false);
    window.location.search = '?lab=1&god=1';
    scene['startMission'](config('aurora'));
    expect(scene['godMode']).toBe(true);
  });

  it('does not interpret ordinary campaign URL flags as lab invincibility', () => {
    const scene = harness('coastal');
    installStartViews(scene);
    window.location.search = '?god=1';
    scene['startMission'](config('coastal'));
    expect(scene['godMode']).toBe(false);
  });

  it('does not persist lab high scores, including direct lobby links without debug flags', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    vi.stubGlobal('window', { location: { search: '?lab=1' } });
    BattleScene['saveHighScore'](999999);
    expect(setItem).not.toHaveBeenCalled();
    window.location.search = '?lab=1&debug=1&graphics=1&mission=lastLight&god=1';
    BattleScene['saveHighScore'](999999);
    expect(setItem).not.toHaveBeenCalled();
    window.location.search = '';
    BattleScene['saveHighScore'](100);
    expect(setItem).toHaveBeenCalledExactlyOnceWith('aegis-vector-high-score', '100');
  });
});
function harness(missionId: MissionId = 'lastLight') {
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), location: { search: '' }, matchMedia: () => ({ matches: true }) });
  const scene = new BattleScene();
  scene['model'].start(config(missionId));
  const group = { clear: vi.fn(), children: { each: vi.fn() }, getMatching: () => [], countActive: () => 0 };
  Object.assign(scene, {
    player: { x: 640, y: 600 }, enemyBullets: group, playerBullets: group, enemies: group,
    enemyHitZones: group, mines: group, pickups: group,
    particles: { setParticleTint: vi.fn(), explode: vi.fn() }, cameras: { main: { shake: vi.fn() } },
    events: { on: vi.fn(), once: vi.fn(), off: vi.fn() }, game: { events: { on: vi.fn(), off: vi.fn() } },
    tweens: { killTweensOf: vi.fn(), killAll: vi.fn(), add: vi.fn() }, time: { now: 1000, delayedCall: vi.fn(), removeAllEvents: vi.fn(), clearPendingEvents: vi.fn() },
    announce: vi.fn(), emitSound: vi.fn(), emitRadio: vi.fn(), emitState: vi.fn(), shieldPulse: vi.fn(),
    destroyEnemyView: vi.fn(), clearArtilleryMarkers: vi.fn(), destroyEnemyHitZones: vi.fn(),
    cleanupDetachedViews: vi.fn(), creditPopup: vi.fn(), spawnPickup: vi.fn(), endFailedMission: vi.fn(),
  });
  return scene;
}
function installStartViews(scene: BattleScene): Array<() => void> {
  const view = {
    x: 640, y: 600, body: { enable: true },
    setTint(_value: number) { return this; }, setTexture(_value: string) { return this; },
    setVelocity(_value: number) { return this; }, setAngle(_value: number) { return this; }, setScale(_value: number) { return this; },
    setFillStyle(_color: number, _alpha: number) { return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setVisible(_value: boolean) { return this; }, setActive(_value: boolean) { return this; }, setAlpha(_value: number) { return this; },
  };
  const callbacks: Array<() => void> = [];
  Object.assign(scene, {
    player: view, playerShadow: view, contrails: view,
    ocean: view, clouds: view, horizonHaze: view, midground: view, ambientWash: view,
    physics: { world: { resume: vi.fn(), pause: vi.fn() } },
    cameras: { main: { fadeIn: vi.fn(), shake: vi.fn() } },
    time: { now: 1000, delayedCall: (_delay: number, action: () => void) => callbacks.push(action), removeAllEvents: vi.fn(), clearPendingEvents: vi.fn() },
  });
  return callbacks;
}
const dispatched = (type: string): CustomEvent[] => vi.mocked(window.dispatchEvent).mock.calls
  .map(([event]) => event as CustomEvent).filter((event) => event.type === type);
function fakeEnemy(kind: EnemyKind) {
  const data: Record<string, unknown> = { kind, health: 100, maxHealth: 100, entityId: 4, state: 'combat', motionStartedAt: 123, motionOriginX: 560, phase: .4, flightMotion: { leg: 3 } };
  const enemy = { active: true, x: 560, y: 150, body: { velocity: { x: 55, y: 40 } },
    getData: (key: string) => data[key],
    setData: (key: string, value: unknown) => { data[key] = value; return enemy; },
    setTint: vi.fn(), setTintFill: vi.fn(), clearTint: vi.fn(), destroy: () => { enemy.active = false; },
  };
  return { enemy, data };
}
function installEnemySpawnViews(scene: BattleScene): void {
  const view = { displayWidth: 0, displayHeight: 0, setDepth: () => view,
    setDisplaySize: (width: number, height: number) => { view.displayWidth = width; view.displayHeight = height; return view; } };
  const container = { ...view, setData: () => container };
  Object.assign(scene, {
    countActiveEnemies: () => 0, createEnemyHitZones: vi.fn(), configureDepthArrival: vi.fn(),
    add: { graphics: () => view, ellipse: () => view, image: () => ({ setOrigin: () => view }), container: () => container },
    physics: { add: { sprite: (x: number, y: number) => {
      const data: Record<string, unknown> = {};
      const sprite = { x, y, width: 260, height: 210, body: { setSize: vi.fn() },
        getData: (key: string) => data[key], setData: (key: string, value: unknown) => { data[key] = value; return sprite; },
        setDepth: () => sprite, setDataEnabled: () => sprite, setVelocityY: () => sprite,
      };
      return sprite;
    } } },
  });
  Object.assign(scene['enemies'], { add: vi.fn() });
}
function installPickupViews(scene: BattleScene) {
  const sprite = (x: number, y: number) => {
    const data: Record<string, unknown> = {};
    const pickup = {
      active: true, x, y, rotation: 0,
      body: { enable: true, velocity: { x: 0, y: 0 }, setCircle: vi.fn() },
      getData: (key: string) => data[key],
      setData: (key: string, value: unknown) => { data[key] = value; return pickup; },
      setDataEnabled: () => pickup, setDepth: () => pickup, setTint: () => pickup,
      setVelocity: (vx: number, vy: number) => { pickup.body.velocity = { x: vx, y: vy }; return pickup; },
      setVelocityY: (vy: number) => { pickup.body.velocity.y = vy; return pickup; },
      setY: (value: number) => { pickup.y = value; return pickup; },
      disableBody: () => { pickup.active = false; pickup.body.enable = false; },
      destroy: () => { pickup.active = false; pickup.body.enable = false; },
    };
    return pickup;
  };
  const pickups: Array<ReturnType<typeof sprite>> = [];
  const group = {
    add: (pickup: ReturnType<typeof sprite>) => pickups.push(pickup),
    getMatching: (_property: string, active: boolean) => pickups.filter((pickup) => pickup.active === active),
    children: { each: (callback: (pickup: ReturnType<typeof sprite>) => void) => [...pickups].forEach(callback) },
  };
  let collect: (player: unknown, pickup: unknown) => void;
  Object.assign(scene, {
    pickups: group,
    physics: { add: { sprite, overlap: (_left: unknown, right: unknown, callback: typeof collect) => {
      if (right === group) collect = callback;
    } } },
  });
  scene['createCollisions']();
  return { pickups, sprite, collect: (pickup: ReturnType<typeof sprite>) => collect(scene['player'], pickup) };
}
function installCompletedDirectorViews(scene: BattleScene): void {
  Object.assign(scene, {
    completeMission: vi.fn(), maybeSecureProgressWaypoint: vi.fn(),
    maybeSpawnMiniboss: () => false, maybeIntroduceBulwark: () => false,
    maybeSpawnArmamentCarrier: vi.fn(), spawnWave: vi.fn(), spawnThreatEscorts: vi.fn(),
  });
}
// Use Phaser's real timer / tween plugins without a canvas or browser boot.
// In particular, Clock.now advances even when Clock.paused is true.
const require = createRequire(import.meta.url);
const NativeClock = require('phaser/src/time/Clock.js') as new (scene: unknown) => Phaser.Time.Clock;
const NativeTweenManager = require('phaser/src/tweens/TweenManager.js') as new (scene: unknown) => Phaser.Tweens.TweenManager;
const NativeKey = require('phaser/src/input/keyboard/keys/Key.js') as new (plugin: unknown, code: number) => Phaser.Input.Keyboard.Key;
const NativeEventEmitter = require('eventemitter3') as new () => Phaser.Events.EventEmitter;
function installCombatLoop(scene: BattleScene) {
  let wallTime = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => wallTime);
  const nativeScene = { sys: { events: { on: vi.fn(), once: vi.fn() }, game: { loop: { time: 0 } } } };
  const clock = new NativeClock(nativeScene);
  const tweens = new NativeTweenManager(nativeScene);
  // boot/start are lifecycle methods which are intentionally driven by this harness.
  (clock as unknown as { boot(): void; start(): void }).boot();
  (clock as unknown as { start(): void }).start();
  (tweens as unknown as { start(): void }).start();
  Object.assign(scene, {
    time: clock, tweens,
    physics: { ...scene['physics'], world: { pause: vi.fn(), resume: vi.fn() } },
  });
  for (const method of ['scrollEnvironment', 'updatePlayer', 'updateDrones', 'updateProjectiles', 'updateEnemies', 'updateMines', 'updateWaveDirector']) {
    Object.assign(scene, { [method]: vi.fn() });
  }
  const advance = (delta: number) => {
    wallTime += delta;
    clock.preUpdate(wallTime, delta);
    clock.update(wallTime, delta);
    tweens.update();
    scene.update(wallTime, delta);
  };
  return { clock, tweens, advance };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function modularHarness(missionId: MissionId = 'lastLight') {
  const scene = harness(missionId), { enemy, data } = fakeEnemy('nullArchitect');
  enemy.y = 250;
  Object.assign(enemy, { displayWidth: 520, displayHeight: 420 });
  data.modularBoss = createModularBoss(1000);
  data.health = 1000;
  data.maxHealth = 1000;
  const definitions = scene['hitboxDefinitions']('nullArchitect');
  const zones = definitions.map((definition, index) => {
    const values: Record<string, unknown> = { role: definition.role, zoneIndex: index, enemy, definition };
    const zone = { active: true, x: enemy.x + definition.x * 520, y: enemy.y + definition.y * 420,
      width: definition.width * 520, height: definition.height * 420,
      body: { enable: true, setSize: vi.fn(), reset: vi.fn() },
      getData: (key: string) => values[key],
      setData: (key: string, value: unknown) => { values[key] = value; return zone; },
      setActive: (active: boolean) => { zone.active = active; return zone; },
      setPosition: (x: number, y: number) => { zone.x = x; zone.y = y; return zone; },
      setSize: (width: number, height: number) => { zone.width = width; zone.height = height; return zone; },
    };
    return zone;
  });
  data.hitZones = zones;
  const ring = { active: true, setDepth: () => ring, setStrokeStyle: () => ring };
  Object.assign(scene, {
    enemies: { getMatching: () => [enemy], children: { each: (callback: (enemy: unknown) => void) => callback(enemy) } },
    add: { circle: vi.fn(() => ring) }, weaponImpact: vi.fn(), ionArc: vi.fn(), siegeBreachPulse: vi.fn(), destroyEnemy: vi.fn(),
  });
  return { scene, enemy, data, zones, state: () => data.modularBoss as ModularBossState };
}

describe('combat runtime contracts without rendering', () => {
  describe('pause-safe combat time', () => {
    it('keeps an Armament pair for twelve playing seconds, excluding repeated long pauses', () => {
      const scene = harness('aurora');
      const { pickups } = installPickupViews(scene);
      const { clock, advance } = installCombatLoop(scene);
      scene['spawnArmamentOffer'](640, 125, 3);
      advance(3000);
      scene['setPaused'](true);
      advance(60_000);
      expect(clock.now).toBe(63_000); // Native Phaser wall clock did not stop.
      expect(scene['model'].stageElapsedMs).toBe(3000);
      scene['setPaused'](false);
      advance(4000);
      expect(pickups.every((pickup) => pickup.active)).toBe(true);
      scene['setPaused'](true);
      advance(30_000);
      scene['setPaused'](false);
      advance(4999);
      expect(pickups.every((pickup) => pickup.active)).toBe(true);
      advance(1);
      expect(pickups.every((pickup) => !pickup.active)).toBe(true);
    });
    it.each(['prism', 'leech'] as const)('preserves the full remaining %s warning and its locked target after pause', (kind) => {
      const scene = harness('aurora'), { enemy, data } = fakeEnemy(kind);
      const { advance } = installCombatLoop(scene);
      const warning = { setDepth: () => warning };
      Object.assign(data, { state: 'combat', nextFire: 0, fireScale: 1, attackIndex: 0 });
      Object.assign(scene, {
        add: { graphics: () => warning }, steerEnemy: vi.fn(), spawnEnemyBullet: vi.fn(),
        updateEnemies: (time: number) => scene['updateExpansionEnemy'](enemy as never, kind, time),
      });
      advance(16);
      const attackAt = data.attackAt as number;
      const plan = structuredClone(data.attackPlan);
      advance(200);
      scene['setPaused'](true);
      advance(30_000);
      scene['player'].x = 100;
      scene['setPaused'](false);
      advance(16);
      expect(scene['spawnEnemyBullet']).not.toHaveBeenCalled();
      expect(data.attackPlan).toEqual(plan);
      advance(attackAt - scene['model'].stageElapsedMs - 1);
      expect(scene['spawnEnemyBullet']).not.toHaveBeenCalled();
      advance(1);
      expect(scene['spawnEnemyBullet']).toHaveBeenCalledTimes(kind === 'prism' ? 3 : 4);
      expect(data.state).toBe('combat');
    });
    it('keeps flight legs and phase animation continuous while native tweens freeze and resume without a leap', () => {
      const scene = harness('aurora'), { enemy, data } = fakeEnemy('phantom');
      const { advance, tweens } = installCombatLoop(scene);
      let alpha = 0;
      Object.assign(data, { state: 'hover', nextFire: Infinity, motionStartedAt: 0, flightMotion: undefined, originX: enemy.x, speedScale: 1 });
      Object.assign(enemy, {
        setVelocity: (x: number, y: number) => { enemy.body.velocity = { x, y }; return enemy; },
        setAlpha: (value: number) => { alpha = value; return enemy; },
      });
      Object.assign(scene, { updateEnemies: (time: number, delta: number) => {
        scene['enemyMotionDelta'] = delta;
        scene['updatePhantom'](enemy as never, time);
        enemy.x += enemy.body.velocity.x * delta / 1000;
        enemy.y += enemy.body.velocity.y * delta / 1000;
      } });
      const visual = { x: 0 };
      tweens.add({ targets: visual, x: 100, duration: 1000, ease: 'Linear' });
      advance(16); advance(16);
      const before = structuredClone({ x: enemy.x, y: enemy.y, velocity: enemy.body.velocity, flightMotion: data.flightMotion, alpha, visual });
      scene['setPaused'](true);
      for (let index = 0; index < 20; index++) advance(16);
      expect({ x: enemy.x, y: enemy.y, velocity: enemy.body.velocity, flightMotion: data.flightMotion, alpha, visual }).toEqual(before);
      scene['setPaused'](false);
      advance(16);
      expect(scene['model'].stageElapsedMs).toBe(48);
      expect(alpha).toBeCloseTo(0.7 + Math.sin(48 * .006) * .18);
      expect(Math.hypot(enemy.x - before.x, enemy.y - before.y)).toBeLessThan(4);
      expect(Math.hypot(enemy.body.velocity.x - before.velocity.x, enemy.body.velocity.y - before.velocity.y)).toBeLessThan(16);
      expect(visual.x - before.visual.x).toBeCloseTo(1.6);
    });
    it('keeps the remaining boss-spawn delay instead of spawning during or immediately after pause', () => {
      const scene = harness();
      const { advance } = installCombatLoop(scene);
      Object.assign(scene, { spawnBoss: vi.fn() });
      scene['scheduleBoss'](650);
      advance(200);
      scene['setPaused'](true);
      advance(30_000);
      expect(scene['spawnBoss']).not.toHaveBeenCalled();
      scene['setPaused'](false);
      advance(449);
      expect(scene['spawnBoss']).not.toHaveBeenCalled();
      advance(1);
      expect(scene['spawnBoss']).toHaveBeenCalledExactlyOnceWith(1);
    });
    it('preserves the 140ms gap before a Bulwark second wing volley across pause', () => {
      const scene = harness('minefield'), { enemy, data } = fakeEnemy('bulwark');
      const { advance } = installCombatLoop(scene);
      Object.assign(enemy, { displayWidth: 260 });
      Object.assign(data, { state: 'volleyWarning', volleyAt: 0, attackIndex: 0, fireScale: 1 });
      Object.assign(scene, { steerEnemy: vi.fn(), spawnEnemyBullet: vi.fn() });
      scene['updateBulwark'](enemy as never, 0);
      expect(scene['spawnEnemyBullet']).toHaveBeenCalledTimes(3);
      advance(40);
      scene['setPaused'](true);
      advance(30_000);
      expect(scene['spawnEnemyBullet']).toHaveBeenCalledTimes(3);
      scene['setPaused'](false);
      advance(99);
      expect(scene['spawnEnemyBullet']).toHaveBeenCalledTimes(3);
      advance(1);
      expect(scene['spawnEnemyBullet']).toHaveBeenCalledTimes(6);
    });
    it('preserves the earned Temporal Echo delay across pause rather than merely deferring its callback', () => {
      const scene = harness('aurora');
      const { advance } = installCombatLoop(scene);
      const ring = { setDepth: () => ring, setStrokeStyle: () => ring, destroy: vi.fn() };
      Object.assign(scene, { add: { circle: () => ring }, activateTemporalEcho: vi.fn() });
      scene['model'].modifiers.temporalEcho = true;
      scene['activateEmp']();
      advance(500);
      scene['setPaused'](true);
      advance(30_000);
      expect(scene['activateTemporalEcho']).not.toHaveBeenCalled();
      scene['setPaused'](false);
      advance(1499);
      expect(scene['activateTemporalEcho']).not.toHaveBeenCalled();
      advance(1);
      expect(scene['activateTemporalEcho']).toHaveBeenCalledExactlyOnceWith(640, 600);
    });
    it('clears old timers/tweens and re-enables their progression when retry replaces a paused run', () => {
      const scene = harness('aurora');
      installStartViews(scene);
      const { clock, tweens, advance } = installCombatLoop(scene);
      Object.assign(scene, { spawnBoss: vi.fn() });
      scene['scheduleBoss'](650);
      const oldVisual = { x: 0 };
      tweens.add({ targets: oldVisual, x: 100, duration: 1000 });
      advance(100);
      scene['setPaused'](true);
      advance(30_000);
      const oldPosition = oldVisual.x;
      const pendingOldCallback = vi.fn();
      clock.delayedCall(100, pendingOldCallback); // Not yet inserted into Clock's active list.
      const shield = { reset: vi.fn(), setStyle: vi.fn(), update: vi.fn() };
      Object.assign(scene, { playerShield: shield });
      scene['startMission'](config('coastal'));
      expect(clock.paused).toBe(false);
      expect(tweens.timeScale).toBe(1);
      expect(scene['model'].stageElapsedMs).toBe(0);
      expect(scene['nextWaveAt']).toBe(1100);
      expect(shield.reset).toHaveBeenCalledOnce();
      const newCallback = vi.fn();
      clock.delayedCall(100, newCallback);
      advance(100);
      expect(newCallback).toHaveBeenCalledOnce();
      advance(500);
      expect(scene['spawnBoss']).not.toHaveBeenCalled();
      expect(pendingOldCallback).not.toHaveBeenCalled();
      expect(oldVisual.x).toBe(oldPosition);
      expect(scene['model'].stageElapsedMs).toBe(600);
      expect(scene['physics'].world.resume).toHaveBeenCalledOnce();
    });
    it('runs extraction and defeat callbacks normally outside playing mode', () => {
      for (const mode of ['complete', 'gameover'] as const) {
        const scene = harness('aurora');
        installStartViews(scene);
        const { advance } = installCombatLoop(scene);
        const surge = { scale: 1, alpha: 1, setDepth: () => surge, setStrokeStyle: () => surge, setBlendMode: () => surge, destroy: vi.fn() };
        const trails = { clear: () => trails, lineStyle: () => trails, lineBetween: () => trails };
        Object.assign(scene, { add: { circle: () => surge }, contrails: trails });
        if (mode === 'complete') scene['completeMission'](false);
        else {
          scene['model'].mode = mode;
          BattleScene.prototype['endFailedMission'].call(scene);
        }
        scene['setPaused'](true); // Pausing is not available on these screens.
        expect(scene['time'].paused).toBe(false);
        expect(scene['tweens'].timeScale).toBe(1);
        advance(mode === 'complete' ? 1600 : 850);
        expect(dispatched('aegis:mission-ended').at(-1)?.detail.mode).toBe(mode);
      }
    });
  });
  describe('pause key focus recovery', () => {
    it.each(['P', 'ESC'] as const)('%s accepts the first fresh press after a missed release on blur, rejects held repeat, and cleans up', (code) => {
      const scene = harness('aurora');
      installStartViews(scene);
      const keys = new Map<string, Phaser.Input.Keyboard.Key>();
      const gameEvents = new NativeEventEmitter(), sceneEvents = new NativeEventEmitter();
      const resetKeys = () => keys.forEach((key) => key.reset());
      gameEvents.on('blur', resetKeys); // Same operation installed KeyboardPlugin performs.
      Object.assign(scene, {
        game: { events: gameEvents }, events: sceneEvents,
        input: { keyboard: {
          createCursorKeys: vi.fn(), addKeys: vi.fn(),
          addKey: (name: string) => {
            const key = new NativeKey({}, name === 'P' ? 80 : 27);
            keys.set(name, key);
            return key;
          },
        } },
      });
      scene['createInput']();
      const key = keys.get(code)!;
      const keyEvent = (repeat = false) => ({ timeStamp: 100, altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, location: 0, repeat }) as KeyboardEvent;
      key.onDown(keyEvent());
      expect(scene['model'].mode).toBe('paused');
      gameEvents.emit('blur');
      key.onDown(keyEvent()); // Released while outside the window: there was no up event.
      expect(scene['model'].mode).toBe('playing');
      gameEvents.emit('blur');
      key.onDown(keyEvent(true)); // Still held when the window regained focus.
      expect(scene['model'].mode).toBe('playing');
      key.onUp(keyEvent());
      key.onDown(keyEvent());
      expect(scene['model'].mode).toBe('paused');
      sceneEvents.emit('shutdown');
      expect(gameEvents.listenerCount('blur')).toBe(1); // Only the harness's native-key reset remains.
      expect(sceneEvents.listenerCount('pause')).toBe(0);
      expect(sceneEvents.listenerCount('sleep')).toBe(0);
    });
  });
  it('binds the Tractor test key only in debug mode', () => {
    const scene = harness();
    const listeners = new Map<string | number, Map<string, () => void>>();
    const addKey = (code: string | number) => {
      const events = new Map<string, () => void>();
      listeners.set(code, events);
      const key = { on: (event: string, callback: () => void) => { events.set(event, callback); return key; } };
      return key;
    };
    Object.assign(scene, { input: { keyboard: { createCursorKeys: vi.fn(), addKeys: vi.fn(), addKey } }, collectPickup: vi.fn() });
    scene['createInput']();
    expect(listeners.has('T')).toBe(false);
    scene['debugMode'] = true;
    scene['createInput']();
    listeners.get('T')!.get('down')!();
    expect(scene['collectPickup']).toHaveBeenCalledExactlyOnceWith('tractor');
  });
  it('the real spawn path fixes finale hull/module health while regular enemies still scale with time', () => {
    const scene = harness();
    installEnemySpawnViews(scene);
    const spawnAt = (kind: EnemyKind, elapsed: number) => {
      scene['model'].stageElapsedMs = elapsed;
      return scene['spawnEnemy'](kind, 640, -100, 0)!;
    };
    for (const elapsed of [35000, 90000, 210000, 600000]) {
      expect(spawnAt('seraph', elapsed).getData('maxHealth')).toBe(2396);
      const architect = spawnAt('nullArchitect', elapsed);
      expect(architect.getData('maxHealth')).toBe(3072);
      expect((architect.getData('modularBoss') as ModularBossState).turrets.every((turret) => turret.health === 169)).toBe(true);
    }
    expect(spawnAt('scout', 210000).getData('maxHealth')).toBeGreaterThan(spawnAt('scout', 35000).getData('maxHealth'));
  });
  it('arms the first-salvo warning only for Bombers spawned in the Coastal opening', () => {
    const scene = harness('coastal');
    installEnemySpawnViews(scene);
    for (const difficulty of ['cadet', 'pilot', 'ace'] as const) {
      for (const mission of ['coastal', 'minefield', 'fortress'] as const) {
        scene['model'].start({ ...config(mission), difficulty });
        for (const progress of [0, .12, .199, .2, .5]) {
          scene['model'].stageElapsedMs = scene['model'].stageDurationMs * progress;
          const bomber = scene['spawnEnemy']('bomber', 640, -100, 0)!;
          expect(bomber.getData('openingFirstSalvoPending')).toBe(mission === 'coastal' && progress < .2);
          expect(scene['spawnEnemy']('scout', 640, -100, 0)!.getData('openingFirstSalvoPending')).toBe(false);
          expect(scene['spawnEnemy']('elite', 640, -100, 0)!.getData('openingFirstSalvoPending')).toBe(false);
        }
      }
    }
  });
  it('spawns the complete deterministic Aurora encounter deck, including its gentler opening formations', () => {
    const scene = harness('aurora');
    const director = new EncounterDirector(42, 'pilot', 'aurora');
    const spawn = vi.fn();
    Object.assign(scene, { spawnEnemy: spawn, encounterDirector: director });
    for (let index = 0; index < 18; index++) {
      const progress = index / 18;
      scene['model'].stageElapsedMs = scene['model'].stageDurationMs * progress;
      spawn.mockClear();
      scene['spawnWave'](index);
      expect(spawn.mock.calls).toEqual(auroraWave(director, index, progress).map(({ kind, x, y, phase }) => [kind, x, y, phase]));
    }
  });
  it.each([['prism', 2], ['leech', 1]] as const)('caps %s pressure and enables its depth arrival only when a slot is available', (kind, cap) => {
    const scene = harness('aurora');
    installEnemySpawnViews(scene);
    Object.assign(scene, { countActiveEnemies: () => cap });
    expect(scene['spawnEnemy'](kind, 640, -90, 1)).toBeUndefined();
    expect(scene['configureDepthArrival']).not.toHaveBeenCalled();
    Object.assign(scene, { countActiveEnemies: () => cap - 1 });
    const enemy = scene['spawnEnemy'](kind, 640, -90, 1)!;
    expect(enemy.getData('kind')).toBe(kind);
    expect(scene['configureDepthArrival']).toHaveBeenCalledExactlyOnceWith(enemy, 900);
  });
  it.each(['prism', 'leech'] as const)('%s keeps its warning target locked and uses its own smooth flight profile', (kind) => {
    const scene = harness('aurora'), { enemy, data } = fakeEnemy(kind);
    data.state = 'entry';
    data.fireScale = 1;
    const warning = { setDepth: () => warning };
    Object.assign(scene, { steerEnemy: vi.fn(), add: { graphics: () => warning }, spawnEnemyBullet: vi.fn() });
    scene['updateExpansionEnemy'](enemy as never, kind, 1000);
    expect(data.state).toBe('combat');
    expect(data.nextFire).toBe(1850);
    expect(scene['steerEnemy']).toHaveBeenLastCalledWith(enemy, kind, false);
    scene['updateExpansionEnemy'](enemy as never, kind, 1850);
    expect(data.state).toBe('volleyWarning');
    const plan = structuredClone(data.attackPlan) as { shots: Array<{ x: number; y: number; angle: number; heavy: boolean; ion?: boolean }> };
    const fireAt = data.attackAt as number;
    scene['player'].x = 100;
    scene['updateExpansionEnemy'](enemy as never, kind, fireAt - 1);
    expect(scene['spawnEnemyBullet']).not.toHaveBeenCalled();
    expect(scene['steerEnemy']).toHaveBeenLastCalledWith(enemy, kind, true);
    scene['updateExpansionEnemy'](enemy as never, kind, fireAt);
    expect(vi.mocked(scene['spawnEnemyBullet']).mock.calls).toEqual(plan.shots.map((shot) => [enemy.x + shot.x, enemy.y + shot.y, shot.angle, shot.heavy, shot.ion]));
    expect(data.state).toBe('combat');
    expect(data.attackIndex).toBe(1);
    expect(data.attackPlan).toBeUndefined();
  });
  it('applies the permanent ARC reward to ARC bullets only, including pooled Overdrive bullets', () => {
    const scene = harness('fortress');
    scene['model'].start({ ...config('fortress'), modifiers: applyRouteReward(buildCombatModifiers([]), 'arc-resonator') });
    const data: Record<string, unknown> = {};
    const bullet = {
      body: { enable: false, setSize: vi.fn() },
      setTexture: () => bullet, setPosition: () => bullet, setActive: () => bullet,
      setVisible: () => bullet, setDepth: () => bullet, setScale: () => bullet,
      setAlpha: () => bullet, clearTint: () => bullet, setRotation: () => bullet,
      setDataEnabled: () => bullet, setVelocity: () => bullet,
      setData: (key: string, value: unknown) => { data[key] = value; return bullet; },
    };
    Object.assign(scene, { playerBullets: { get: () => bullet } });
    for (const overdrive of [false, true]) {
      for (const [weapon, texture] of [['spread', ASSET_KEYS.playerBullet], ['missile', ASSET_KEYS.missile], ['laser', ASSET_KEYS.laser], ['drone', ASSET_KEYS.wingBullet]] as const) {
        scene['spawnPlayerBullet'](640, 600, texture, 0, 10, overdrive, weapon);
        expect(data.damage).toBeCloseTo(weapon === 'spread' ? 11.2 : 10);
        expect(data.weaponKind).toBe(weapon);
      }
    }
    expect(scene['model'].shotsFired).toBe(8);
  });
  it.each(['spread', 'laser', 'drone', 'missile'] as const)('%s projectiles use real turret hitboxes and cannot damage the shielded hull', (kind) => {
    const { scene, enemy, zones, state } = modularHarness();
    const projectile = () => {
      const data: Record<string, unknown> = { hitTargets: new Set<number>(), damage: 10, missile: kind === 'missile', pierce: 0, weaponKind: kind };
      const bullet = { active: true, getData: (key: string) => data[key], setData: (key: string, value: unknown) => { data[key] = value; return bullet; },
        disableBody: () => { bullet.active = false; },
      };
      return bullet;
    };
    scene['hitEnemy'](projectile() as never, zones[6] as never);
    expect(state().hull).toBe(1000);
    expect(state().turrets.every((turret) => turret.health === 55)).toBe(true);
    const bullet = projectile();
    scene['hitEnemy'](bullet as never, zones[2] as never);
    scene['hitEnemy'](bullet as never, zones[3] as never); // overlapping collider callback
    expect(state().turrets[2].health).toBe(45);
    expect(state().turrets[3].health).toBe(55);
    expect(state().hull).toBe(1000);
    expect(enemy.active).toBe(true);
  });
  it('routes actual EMP, temporal echo, NOVA splash and ION discharge through the module gate', () => {
    const { scene, enemy, state } = modularHarness();
    scene['activateEmp']();
    scene['activateTemporalEcho'](enemy.x, enemy.y);
    scene['applyMissileSplash'](enemy.x, enemy.y, 999, 10, 75);
    scene['applyIonDischarge'](enemy.x, enemy.y, 999, 8);
    expect(state().hull).toBe(1000);
    expect(state().turrets.reduce((sum, turret) => sum + turret.health, 0)).toBeCloseTo(330 - 35 - 18 - 10 - 8);
    expect(scene['destroyEnemy']).not.toHaveBeenCalled();
  });
  describe('Temporal Echo lifetime', () => {
    const setup = () => {
      const scene = harness('coastal');
      installStartViews(scene);
      scene['model'].modifiers.temporalEcho = true;
      const pending: Array<{ delay: number; callback: () => void }> = [];
      const ring = { setDepth: () => ring, setStrokeStyle: () => ring, destroy: vi.fn() };
      const echo = vi.fn();
      Object.assign(scene, {
        time: { now: 1000, delayedCall: (delay: number, callback: () => void) => pending.push({ delay, callback }), removeAllEvents: vi.fn(), clearPendingEvents: vi.fn() },
        add: { circle: () => ring }, activateTemporalEcho: echo,
      });
      scene['activateEmp']();
      expect(pending).toHaveLength(1);
      expect(pending[0].delay).toBe(2000);
      return { scene, pending, echo };
    };
    it('fires once at the original EMP location during the same active mission', () => {
      const { scene, pending, echo } = setup();
      scene['player'].x = 900;
      pending.shift()!.callback();
      expect(echo).toHaveBeenCalledExactlyOnceWith(640, 600);
      expect(pending).toHaveLength(0);
    });
    it.each(['restart', 'isolate'] as const)('discards a pending echo after %s replaces the battlefield', (action) => {
      const { scene, pending, echo } = setup();
      const run = scene['missionRun'];
      if (action === 'restart') scene['startMission'](config('coastal'));
      else {
        scene['debugMode'] = true;
        window.location.search = '?debug=1&graphics=1';
        Object.assign(scene, { spawnEnemy: vi.fn(() => fakeEnemy('seraph').enemy) });
        scene['previewEnemy']('seraph');
      }
      expect(scene['missionRun']).toBe(run + 1);
      pending.shift()!.callback();
      expect(echo).not.toHaveBeenCalled();
      expect(pending).toHaveLength(0);
    });
    it('keeps the same-run echo pending through pause and fires once after resume', () => {
      const { scene, pending, echo } = setup();
      scene['setPaused'](true);
      for (let wait = 0; wait < 3; wait++) {
        pending.shift()!.callback();
        expect(echo).not.toHaveBeenCalled();
        expect(pending).toHaveLength(1);
        expect(pending[0].delay).toBe(150);
      }
      scene['setPaused'](false);
      pending.shift()!.callback();
      expect(echo).toHaveBeenCalledExactlyOnceWith(640, 600);
      expect(pending).toHaveLength(0);
    });
    it('cancels an already-deferred echo when retry replaces the paused run', () => {
      const { scene, pending, echo } = setup();
      scene['setPaused'](true);
      pending.shift()!.callback();
      scene['startMission'](config('coastal'));
      pending.shift()!.callback();
      expect(echo).not.toHaveBeenCalled();
      expect(pending).toHaveLength(0);
    });
    it.each(['gameover', 'complete', 'victory', 'briefing'] as const)('cancels without rescheduling when the mission enters %s', (mode) => {
      const { scene, pending, echo } = setup();
      scene['model'].mode = mode;
      pending.shift()!.callback();
      expect(echo).not.toHaveBeenCalled();
      expect(pending).toHaveLength(0);
    });
  });
  it('aims ION at the same live module it damages, including after another pod dies', () => {
    const { scene, enemy, zones, state } = modularHarness();
    scene['model'].weapons.ion = 1;
    scene['damageEnemy'](enemy as never, 75, 'weakpoint', 0);
    scene['fireIon'](5000);
    expect(scene['ionArc']).toHaveBeenLastCalledWith(scene['player'].x, scene['player'].y - 38, zones[1].x, zones[1].y);
    expect(state().turrets[1].health).toBeCloseTo(51.8);
    expect(state().hull).toBe(1000);
  });
  it('disables destroyed pods, opens the hull only after six kills, and emits each breach pulse once', () => {
    const { scene, enemy, zones, state } = modularHarness();
    const before = scene['model'].exportCheckpoint();
    for (let index = 0; index < 6; index++) {
      scene['damageEnemy'](enemy as never, 9999, 'weakpoint', index);
      scene['damageEnemy'](enemy as never, 9999, 'weakpoint', index);
      expect(zones[index].active).toBe(false);
      expect(zones[index].body.enable).toBe(false);
      expect(state().hull).toBe(1000);
    }
    expect(activeTurretCount(state())).toBe(0);
    expect(scene['siegeBreachPulse']).toHaveBeenCalledTimes(6);
    expect(scene['announce']).toHaveBeenLastCalledWith('ALL TURRETS DISABLED // HULL EXPOSED');
    expect(scene['model'].exportCheckpoint()).toEqual(before);
    expect(scene['destroyEnemy']).not.toHaveBeenCalled();
    scene['damageEnemy'](enemy as never, 1000, 'core', 6);
    expect(scene['destroyEnemy']).toHaveBeenCalledExactlyOnceWith(enemy);
  });
  it('keeps the tactical breach reward exclusive to Last Light', () => {
    const { scene, enemy } = modularHarness('coastal');
    scene['damageEnemy'](enemy as never, 75, 'weakpoint', 0);
    expect(scene['siegeBreachPulse']).not.toHaveBeenCalled();
  });
  it('aligns six damage targets with model pivots, leaves rear batteries reachable, then enables exposed hull plates', () => {
    const { scene, enemy, zones, state } = modularHarness();
    Object.assign(enemy, { angle: 0 });
    scene['setEnemyHitZonesEnabled'](enemy as never, false);
    expect(zones.every((zone) => !zone.active && !zone.body.enable)).toBe(true);
    scene['setEnemyHitZonesEnabled'](enemy as never, true);
    const definitions = scene['hitboxDefinitions']('nullArchitect');
    for (let index = 0; index < 6; index++) {
      const pose = siegeTurretPose(index, state().turrets[index].rotation, 520, 420);
      expect(zones[index].x).toBeCloseTo(enemy.x + pose.x);
      expect(zones[index].y).toBeCloseTo(enemy.y + pose.y);
      expect(zones[index].body.enable).toBe(true);
      expect(zones[index].active).toBe(true);
    }
    expect(zones[6].body.enable).toBe(true);
    expect(zones.slice(7).every((zone) => !zone.body.enable)).toBe(true);
    // Remove front/middle batteries before testing rear ones. A vertical ARC
    // centerline never meets a remaining shielded hull before the target.
    for (const index of [0, 1, 3, 4, 2, 5]) {
      const target = zones[index];
      const blockers = zones.filter((zone, other) => other !== index && zone.body.enable &&
        zone.y > target.y && Math.abs(target.x - zone.x) < zone.width / 2);
      expect(blockers).toEqual([]);
      scene['damageEnemy'](enemy as never, 9999, 'weakpoint', index);
      scene['syncEnemyHitZones'](enemy as never);
      expect(target.body.enable).toBe(false);
    }
    expect(zones.slice(6).every((zone) => zone.body.enable)).toBe(true);
    expect(state().hull).toBe(1000);
    // Inscribed rectangles remain within the authored hull's horizontal extent.
    expect(definitions.slice(6).every((rect) => Math.abs(rect.x) + rect.width / 2 < .33)).toBe(true);
  });
  it('holds the neutral Crown hull frame and uniform scale so separate gun pivots cannot drift', () => {
    const { scene, enemy, data } = modularHarness();
    scene['dimensional'] = true;
    Object.assign(enemy, { angle: 0, rotation: 0, scaleX: 2, scaleY: 2,
      setFrame: vi.fn(() => enemy), setScale: vi.fn(() => enemy) });
    data.displayScale = 2;
    data.visualBank = 30;
    Object.assign(scene, { syncEnemyHitZones: vi.fn() });
    scene['updateEnemyPresentation'](enemy as never, 16);
    expect(data.visualBank).toBe(0);
    expect((enemy as unknown as { setFrame: ReturnType<typeof vi.fn> }).setFrame).toHaveBeenLastCalledWith(7);
    expect((enemy as unknown as { setScale: ReturnType<typeof vi.fn> }).setScale).toHaveBeenLastCalledWith(2, 2);
  });
  it('cancels a destroyed pod’s already-telegraphed shots before the salvo fires', () => {
    const { scene, enemy, data, state } = modularHarness();
    data.state = 'volleyWarning';
    data.attackIndex = 0;
    data.attackAt = 1000;
    data.fireScale = 1;
    data.attackPlan = buildTurretVolley(state(), 0, 520, 420);
    Object.assign(scene, { steerEnemy: vi.fn(), ambientWash: { setAlpha: vi.fn() }, spawnEnemyBullet: vi.fn() });
    scene['damageEnemy'](enemy as never, 75, 'weakpoint', 0);
    scene['updateExpansionEnemy'](enemy as never, 'nullArchitect', 1000);
    expect(scene['spawnEnemyBullet']).toHaveBeenCalledTimes(10);
    expect(data.state).toBe('combat');
    expect(data.attackPlan).toBeUndefined();
  });
  it('locks all six physical gun bearings during warning and launches along those lines despite player movement', () => {
    const { scene, enemy, data, state } = modularHarness();
    const warning = { active: true, setDepth: () => warning, clear: () => warning, lineStyle: () => warning,
      lineBetween: vi.fn(() => warning), strokeCircle: vi.fn(() => warning) };
    Object.assign(scene, { steerEnemy: vi.fn(), ambientWash: { setAlpha: vi.fn() }, spawnEnemyBullet: vi.fn(),
      add: { graphics: () => warning } });
    data.attackIndex = 0;
    data.nextFire = 2000;
    data.fireScale = 1;
    scene['player'].x = 1040;
    const original = state();
    scene['updateExpansionEnemy'](enemy as never, 'nullArchitect', 1000);
    state().turrets.forEach((turret, index) => {
      expect(Math.abs(turret.rotation - original.turrets[index].rotation)).toBeLessThanOrEqual(SIEGE_TURRET_TURN_RATE * .05);
    });
    for (let frame = 0; frame < 60; frame++) scene['updateExpansionEnemy'](enemy as never, 'nullArchitect', 1010 + frame * 16);
    scene['updateExpansionEnemy'](enemy as never, 'nullArchitect', 2000);
    const locked = state();
    const plan = data.attackPlan as ReturnType<typeof buildTurretVolley>;
    expect(data.state).toBe('volleyWarning');
    scene['player'].x = 140;
    scene['updateExpansionEnemy'](enemy as never, 'nullArchitect', 2200);
    expect(state()).toBe(locked);
    plan.shots.forEach((shot) => {
      const pose = siegeTurretPose(shot.module!, locked.turrets[shot.module!].rotation, 520, 420);
      expect(shot.angle).toBe(pose.angle);
      expect(warning.lineBetween).toHaveBeenCalledWith(enemy.x + shot.x, enemy.y + shot.y,
        enemy.x + shot.x + Math.cos(shot.angle) * 950, enemy.y + shot.y + Math.sin(shot.angle) * 950);
    });
    scene['updateExpansionEnemy'](enemy as never, 'nullArchitect', 3250);
    expect(scene['spawnEnemyBullet']).toHaveBeenCalledTimes(12);
    plan.shots.forEach((shot) => expect(scene['spawnEnemyBullet']).toHaveBeenCalledWith(enemy.x + shot.x, enemy.y + shot.y, shot.angle, shot.heavy, shot.ion));
  });
  it.each(['seraph', 'nullArchitect'] as const)('%s announces each attack once but preserves repeated spatial and audio warnings', (kind) => {
    const scene = harness(), { enemy, data } = fakeEnemy(kind);
    Object.assign(enemy, { scaleX: 1, scaleY: 1, displayWidth: 520, displayHeight: 420 });
    if (kind === 'nullArchitect') data.modularBoss = createModularBoss(100);
    const warning = { setDepth: () => warning };
    Object.assign(scene, { steerEnemy: vi.fn(), ambientWash: { setAlpha: vi.fn() }, add: { graphics: vi.fn(() => warning) } });
    const startAttack = (index: number) => {
      data.state = 'combat';
      data.attackIndex = index;
      data.nextFire = 1000;
      scene['updateExpansionEnemy'](enemy as never, kind, 1000);
      expect(data.state).toBe('volleyWarning');
      expect(data.telegraph).toBe(warning);
    };
    for (const index of [0, 1, 2, 3, 4, 5]) startAttack(index);
    expect(scene['announce']).toHaveBeenCalledTimes(2);
    expect(new Set(vi.mocked(scene['announce']).mock.calls.map(([name]) => name)).size).toBe(2);
    expect(scene['add'].graphics).toHaveBeenCalledTimes(6);
    expect(scene['emitSound']).toHaveBeenCalledTimes(6);
    expect(scene['emitSound']).toHaveBeenLastCalledWith('warning');
    data.health = 50;
    if (kind === 'nullArchitect') {
      data.modularBoss = { ...createModularBoss(100), hull: 50, turrets: [] };
    }
    startAttack(6);
    expect(scene['announce']).toHaveBeenCalledWith(`${kind === 'seraph' ? 'SERAPH' : 'OBSIDIAN CROWN'} // PHASE 2`);
  });
  it('breach pulses clear only nearby hostile shots and grant no charge, health or credits', () => {
    const { scene } = modularHarness();
    const shots = [{ active: true, x: 500, y: 300 }, { active: true, x: 664, y: 300 }, { active: true, x: 666, y: 300 }];
    Object.assign(scene, { enemyBullets: { children: { each: (callback: (shot: unknown) => void) => shots.forEach(callback) } }, disableBody: vi.fn() });
    const before = scene['model'].exportCheckpoint();
    BattleScene.prototype['siegeBreachPulse'].call(scene, 500, 300);
    expect(scene['disableBody']).toHaveBeenCalledTimes(2);
    expect(scene['disableBody']).not.toHaveBeenCalledWith(shots[2]);
    expect(scene['model'].exportCheckpoint()).toEqual(before);
    expect(scene['shieldPulse']).not.toHaveBeenCalled();
  });
  it('isolates a craft only in the opt-in graphics review and suppresses waves, saves and finale rewards', () => {
    const scene = harness(), { enemy } = fakeEnemy('seraph');
    const spawn = vi.fn(() => enemy);
    Object.assign(scene, { spawnEnemy: spawn });
    scene['previewEnemy']('seraph');
    expect(spawn).not.toHaveBeenCalled();
    scene['debugMode'] = true;
    scene['previewEnemy']('seraph');
    expect(spawn).not.toHaveBeenCalled();
    window.location.search = '?debug=1&graphics=1';
    const oldRun = scene['missionRun'];
    scene['previewEnemy']('seraph');
    expect(spawn).toHaveBeenCalledExactlyOnceWith('seraph', 640, 110, 0);
    expect(scene['missionRun']).toBe(oldRun + 1);
    expect(scene['enemies'].clear).toHaveBeenCalled();
    expect(scene['isolatedCraftPreview']).toBe(true);
    Object.assign(scene, { updateDreadnoughtApproach: vi.fn() });
    scene['updateWaveDirector'](100000);
    scene['secureWaypoint'](1);
    scene['debugCompleteMission']();
    expect(scene['updateDreadnoughtApproach']).not.toHaveBeenCalled();
    expect(dispatched('aegis:waypoint-secured')).toHaveLength(0);
    expect(dispatched('aegis:mission-clear')).toHaveLength(0);
    const before = scene['model'].exportCheckpoint();
    scene['destroyEnemy'](enemy as never);
    expect(scene['model'].exportCheckpoint()).toEqual(before);
    expect(scene['model'].mode).toBe('playing');
    expect(scene['announce']).toHaveBeenLastCalledWith('CRAFT DESTROYED // ISOLATE TO REPLAY');
    installStartViews(scene);
    scene['startMission'](config('lastLight'));
    expect(scene['isolatedCraftPreview']).toBe(false);
  });
  it('gives the first Coastal waves smaller actual formations, then ramps to full groups', () => {
    const scene = harness('coastal'), spawn = vi.fn();
    Object.assign(scene, { spawnEnemy: spawn, waveX: () => 640 });
    scene['spawnWave'](0);
    expect(spawn).toHaveBeenCalledTimes(3);
    spawn.mockClear(); scene['spawnWave'](1);
    expect(spawn).toHaveBeenCalledTimes(2);
    spawn.mockClear(); scene['spawnBaseHeavyWave'](2, .05);
    expect(spawn).toHaveBeenCalledTimes(2);
    scene['model'].stageElapsedMs = scene['model'].stageDurationMs * .3;
    spawn.mockClear(); scene['spawnWave'](0);
    expect(spawn).toHaveBeenCalledTimes(5);
  });
  it('alternates early heavy slots with scouts and caps regular Coastal Bombers at one', () => {
    const scene = harness('coastal'), spawn = vi.fn(), count = vi.fn(() => 0);
    Object.assign(scene, { spawnEnemy: spawn, waveX: () => 640, countActiveEnemies: count });
    scene['spawnBaseHeavyWave'](2, .07);
    expect(spawn.mock.calls.map(([kind]) => kind)).toEqual(['bomber', 'scout']);
    spawn.mockClear(); scene['spawnBaseHeavyWave'](3, .1);
    expect(spawn.mock.calls.map(([kind]) => kind)).toEqual(['scout', 'scout']);
    count.mockReturnValue(1);
    spawn.mockClear(); scene['spawnBaseHeavyWave'](4, .14);
    expect(spawn.mock.calls.map(([kind]) => kind)).toEqual(['scout', 'scout']);
    spawn.mockClear(); scene['spawnBaseHeavyWave'](4, .2);
    expect(spawn.mock.calls.map(([kind]) => kind)).toEqual(['bomber', 'scout', 'scout', 'scout']);
    scene['model'].start(config('minefield'));
    spawn.mockClear(); scene['spawnBaseHeavyWave'](3, .1);
    expect(spawn.mock.calls.map(([kind]) => kind)).toEqual(['bomber', 'scout', 'scout', 'scout']);
  });
  it('replaces the next ordinary Coastal wave with the first unreinforced carrier', () => {
    const scene = harness('coastal'), { enemy } = fakeEnemy('bomber');
    Object.assign(scene, {
      time: { now: 23_400 }, nextWaveAt: 26_700, waveIndex: 4,
      spawnEnemy: vi.fn(() => enemy), markCarrier: vi.fn(), spawnWave: vi.fn(), spawnThreatEscorts: vi.fn(),
      maybeSecureProgressWaypoint: vi.fn(), maybeSpawnMiniboss: () => false,
      maybeIntroduceBulwark: () => false, maybeSpawnCommandTargets: vi.fn(),
    });
    scene['model'].stageElapsedMs = 23_400;
    scene['updateWaveDirector'](23_400);
    expect(scene['spawnEnemy']).toHaveBeenCalledExactlyOnceWith('bomber', 640, -100, 0);
    expect(scene['markCarrier']).toHaveBeenCalledExactlyOnceWith(enemy, 0, false);
    expect(scene['nextCarrierIndex']).toBe(1);
    expect(scene['waveIndex']).toBe(5);
    expect(scene['nextWaveAt']).toBe(33_100);
    expect(scene['spawnWave']).not.toHaveBeenCalled();
    expect(scene['spawnThreatEscorts']).not.toHaveBeenCalled();
    scene['model'].stageElapsedMs = 33_100;
    scene['updateWaveDirector'](33_100);
    expect(scene['spawnWave']).toHaveBeenCalledExactlyOnceWith(5);
    expect(scene['waveIndex']).toBe(6);
    expect(scene['nextWaveAt']).toBe(39_500);
    scene['maybeSpawnArmamentCarrier'](.52);
    expect(scene['markCarrier']).toHaveBeenLastCalledWith(enemy, 1, true);
    expect(scene['waveIndex']).toBe(6);
    expect(scene['nextWaveAt']).toBe(39_500);
  });
  it('does not consume the replacement wave or carrier cursor when the carrier cannot spawn', () => {
    const scene = harness('coastal');
    Object.assign(scene, { time: { now: 23_400 }, nextWaveAt: 26_700, waveIndex: 4, spawnEnemy: vi.fn(() => undefined), markCarrier: vi.fn() });
    scene['maybeSpawnArmamentCarrier'](.12);
    expect(scene['nextCarrierIndex']).toBe(0);
    expect(scene['waveIndex']).toBe(4);
    expect(scene['nextWaveAt']).toBe(26_700);
    expect(scene['markCarrier']).not.toHaveBeenCalled();
  });
  it('preserves ordinary health for the opening carrier but reinforces later carriers', () => {
    const scene = harness('coastal'), { enemy, data } = fakeEnemy('bomber');
    const aura = { setDepth: () => aura, setStrokeStyle: () => aura };
    Object.assign(scene, { add: { circle: () => aura }, configureDepthArrival: vi.fn() });
    data.health = 10; data.maxHealth = 10;
    scene['markCarrier'](enemy as never, 0, false);
    expect([data.health, data.maxHealth]).toEqual([10, 10]);
    expect(scene['configureDepthArrival']).not.toHaveBeenCalled();
    scene['markCarrier'](enemy as never, 1);
    expect([data.health, data.maxHealth]).toEqual([14, 14]);
    expect(scene['configureDepthArrival']).toHaveBeenCalledExactlyOnceWith(enemy, 1100);
  });
  it('holds an opening Bomber first volley until 700ms after combat arrival, with a following warning', () => {
    const scene = harness('coastal'), { enemy, data } = fakeEnemy('bomber');
    const ring = { setDepth: () => ring, setStrokeStyle: () => ring, setPosition: vi.fn(() => ring), setAlpha: vi.fn(() => ring) };
    Object.assign(scene, { add: { circle: vi.fn(() => ring) }, steerEnemy: vi.fn(), enemyFire: vi.fn() });
    Object.assign(data, { state: 'entry', openingFirstSalvoPending: true, nextFire: 0, fireScale: .88 });
    enemy.y = 100;
    scene['updateStandardEnemy'](enemy as never, 'bomber', 1000);
    expect(scene['enemyFire']).not.toHaveBeenCalled();
    expect(scene.add.circle).not.toHaveBeenCalled();
    enemy.y = 136;
    scene['updateStandardEnemy'](enemy as never, 'bomber', 1100);
    expect(data.state).toBe('combat');
    expect(data.openingFirstSalvoAt).toBe(1800);
    expect(data.nextFire).toBe(1800);
    expect(scene.add.circle).toHaveBeenCalledTimes(1);
    enemy.x = 580;
    scene['updateStandardEnemy'](enemy as never, 'bomber', 1799);
    expect(ring.setPosition).toHaveBeenLastCalledWith(580, 160);
    expect(scene['enemyFire']).not.toHaveBeenCalled();
    scene['updateStandardEnemy'](enemy as never, 'bomber', 1800);
    expect(scene['enemyFire']).toHaveBeenCalledExactlyOnceWith(enemy, 'bomber');
    expect(scene['destroyEnemyView']).toHaveBeenCalledWith(enemy, 'telegraph');
    expect(data.openingFirstSalvoPending).toBe(false);
    expect(data.nextFire).toBeGreaterThan(1800);
    scene['updateStandardEnemy'](enemy as never, 'bomber', 1801);
    expect(scene['enemyFire']).toHaveBeenCalledTimes(1);
    expect(scene.add.circle).toHaveBeenCalledTimes(1);
  });
  it('forwards real mission starts and frame updates to the Classic space adapter', () => {
    const scene = harness();
    installStartViews(scene);
    const space = { setMission: vi.fn(), update: vi.fn(() => true) };
    Object.assign(scene, { classicSpaceEnvironment: space });
    scene['startMission'](config('lastLight'));
    expect(space.setMission).toHaveBeenLastCalledWith('lastLight');
    scene['scrollEnvironment'](16);
    expect(space.update).toHaveBeenLastCalledWith(16, 640, 0);
    // No foreground exists in this harness: reaching legacy scroll would fail.
    scene['startMission'](config('coastal'));
    expect(space.setMission).toHaveBeenLastCalledWith('coastal');
  });
  it('one hostile projectile callback cannot consume a second shield cell after being disabled', () => {
    const scene = harness('coastal');
    scene['model'].start({ ...config('coastal'), shieldBaseMax: 3 });
    const callbacks: Array<(a: unknown, b: unknown) => void> = [];
    Object.assign(scene, { physics: { add: { overlap: (_a: unknown, _b: unknown, action: (a: unknown, b: unknown) => void) => callbacks.push(action) } } });
    scene['createCollisions']();
    const projectile = { active: true, disableBody: () => { projectile.active = false; } };
    callbacks[2](scene['player'], projectile);
    expect(scene['model'].shield).toBe(2);
    scene['model'].tick(1000);
    callbacks[2](scene['player'], projectile);
    expect(scene['model'].shield).toBe(2);
    expect(scene['damageAttempts']).toBe(1);
  });
  it('several hull rectangles touching the player count as one ram, not several hits', () => {
    const scene = harness('coastal'), { enemy } = fakeEnemy('seraph');
    scene['model'].start({ ...config('coastal'), shieldBaseMax: 3 });
    const callbacks: Array<(a: unknown, b: unknown) => void> = [];
    Object.assign(scene, { physics: { add: { overlap: (_a: unknown, _b: unknown, action: (a: unknown, b: unknown) => void) => callbacks.push(action) } } });
    scene['createCollisions']();
    callbacks[3](scene['player'], { getData: () => enemy });
    callbacks[3](scene['player'], { getData: () => enemy });
    expect(scene['model'].shield).toBe(2);
    expect(scene['damageAttempts']).toBe(1);
  });
  it('only explicit god mode blocks damage; normal damage can destroy the fighter', () => {
    const scene = harness('coastal'), model = scene['model'];
    scene['godMode'] = true;
    scene['damagePlayer']();
    expect(model.shield).toBe(1);
    expect(scene['lastDamageResult']).toBe('god-mode');
    scene['godMode'] = false;
    scene['damagePlayer']();
    expect(model.shield).toBe(0);
    for (let hit = 0; hit < 3; hit++) { model.tick(1300); scene['damagePlayer'](); }
    expect(model.mode).toBe('gameover');
    expect(scene['endFailedMission']).toHaveBeenCalledOnce();
    expect(scene['damageAttempts']).toBe(5);
  });
  it('reports Shield Hit only for accepted damage that leaves shields intact, and Shield down at depletion', () => {
    const scene = harness('coastal'), model = scene['model'];
    model.start({ ...config('coastal'), shieldBaseMax: 3 });
    scene['damagePlayer']();
    expect(model.shield).toBe(2);
    expect(scene['emitRadio']).toHaveBeenLastCalledWith('shield-hit');
    scene['damagePlayer'](); // Same-frame overlaps are ignored by damage grace.
    expect(scene['emitRadio']).toHaveBeenCalledTimes(1);
    model.tick(1300);
    scene['damagePlayer']();
    expect(model.shield).toBe(1);
    expect(scene['emitRadio']).toHaveBeenLastCalledWith('shield-hit');
    model.tick(1300);
    scene['damagePlayer']();
    expect(model.shield).toBe(0);
    expect(scene['emitRadio']).toHaveBeenLastCalledWith('shield-down');
    expect(scene['emitRadio']).toHaveBeenCalledTimes(3);
    model.tick(1300);
    scene['damagePlayer'](); // A hull hit is not a shield hit.
    expect(scene['emitRadio']).toHaveBeenCalledTimes(3);
  });
  it('does not report Shield Hit for a reserve activation or a blocked god-mode hit', () => {
    const scene = harness('coastal'), model = scene['model'];
    model.start({ ...config('coastal'), modifiers: buildCombatModifiers(['aegis-bank']) });
    scene['godMode'] = true;
    scene['damagePlayer']();
    expect(scene['emitRadio']).not.toHaveBeenCalled();
    scene['godMode'] = false;
    scene['damagePlayer']();
    expect(scene['lastDamageResult']).toBe('reserve');
    expect(scene['emitRadio']).not.toHaveBeenCalled();
    expect(scene['announce']).toHaveBeenCalledWith('AEGIS RESERVE // SHIELD RESTORED');
  });
  it.each(['bomber', 'elite', 'prism', 'leech'] as const)('a hit on %s never resets flight origin, phase, velocity, state or active leg', (kind) => {
    const scene = harness();
    const { enemy, data } = fakeEnemy(kind);
    Object.assign(scene, { isProtectedByCarrier: () => false });
    const before = structuredClone({ data, body: enemy.body, x: enemy.x, y: enemy.y });
    scene['damageEnemy'](enemy as never, 2);
    expect(data.health).toBe(98);
    for (const key of ['state', 'motionStartedAt', 'motionOriginX', 'phase', 'flightMotion']) expect(data[key]).toEqual(before.data[key]);
    expect(enemy.body).toEqual(before.body);
    expect([enemy.x, enemy.y]).toEqual([before.x, before.y]);
  });
  it('sustained Seraph hits preserve texture tint, use struck-zone sparks and leave movement untouched', () => {
    const scene = harness(), { enemy, data } = fakeEnemy('seraph');
    const zones = [{ x: 470, y: 190 }, { x: 650, y: 190 }];
    data.hitZones = zones;
    const before = structuredClone({ data, body: enemy.body, x: enemy.x, y: enemy.y });
    const clears: Array<() => void> = [];
    Object.assign(scene, { time: { now: 1000, delayedCall: (delay: number, callback: () => void) => {
      expect(delay).toBe(45);
      clears.push(callback);
    } } });
    for (let index = 0; index < 20; index++) {
      scene['damageEnemy'](enemy as never, 2, 'core', index % 2);
      expect(scene['particles'].explode).toHaveBeenLastCalledWith(3, zones[index % 2].x, zones[index % 2].y);
    }
    expect(data.health).toBe(60);
    expect(enemy.setTint).toHaveBeenCalledTimes(20);
    expect(enemy.setTint).toHaveBeenLastCalledWith(0xffe9d6);
    expect(enemy.setTintFill).not.toHaveBeenCalled();
    for (const key of ['state', 'motionStartedAt', 'motionOriginX', 'phase', 'flightMotion']) expect(data[key]).toEqual(before.data[key]);
    expect(enemy.body).toEqual(before.body);
    expect([enemy.x, enemy.y]).toEqual([before.x, before.y]);
    clears.forEach((callback) => callback());
    expect(enemy.clearTint).toHaveBeenCalledTimes(20);
    scene['damageEnemy'](enemy as never, 1);
    expect(scene['particles'].explode).toHaveBeenLastCalledWith(3, enemy.x, enemy.y);
  });
  it('keeps the existing filled hit flash on ordinary enemies', () => {
    const scene = harness(), { enemy } = fakeEnemy('bomber');
    Object.assign(scene, { isProtectedByCarrier: () => false });
    scene['damageEnemy'](enemy as never, 2);
    expect(enemy.setTintFill).toHaveBeenCalledExactlyOnceWith(0xffffff);
    expect(enemy.setTint).not.toHaveBeenCalled();
  });
  it('advances past Seraph once, captures the clean second boundary, then announces and schedules Obsidian Crown', () => {
    const scene = harness(), model = scene['model'];
    model.setFinalePhase('boss');
    const { enemy } = fakeEnemy('seraph');
    scene['boss'] = enemy as never;
    const secure = vi.fn(() => {
      expect(model.finaleBossStage).toBe('nullArchitect');
      expect(scene['boss']).toBeUndefined();
      expect(model.creditsEarned).toBe(ENEMIES.seraph.credits);
    });
    Object.assign(scene, { secureWaypoint: secure, scheduleBoss: vi.fn() });
    scene['destroyEnemy'](enemy as never);
    scene['destroyEnemy'](enemy as never);
    expect(secure).toHaveBeenCalledExactlyOnceWith(2);
    expect(scene['scheduleBoss']).toHaveBeenCalledExactlyOnceWith(2600);
    expect(scene['announce']).toHaveBeenCalledExactlyOnceWith('SERAPH DESTROYED // OBSIDIAN CROWN AWAKENS');
    expect(model.kills).toBe(1);
    expect(model.mode).toBe('playing');
  });
  it('spawns the saved second boss directly with no replayed Seraph reward or heal', () => {
    const scene = harness(), model = scene['model'];
    model.setFinalePhase('boss');
    model.advanceFinaleBoss();
    model.takeDamage();
    const { enemy } = fakeEnemy('nullArchitect');
    const spawn = vi.fn((_kind: EnemyKind) => enemy);
    Object.assign(scene, { spawnEnemy: spawn });
    scene['spawnBoss']();
    expect(spawn.mock.calls[0]?.[0]).toBe('nullArchitect');
    expect(model.kills).toBe(0);
    expect(model.shield).toBe(0);
    expect(model.bossName).toBe('OBSIDIAN CROWN');
  });
  it('invalidates delayed boss spawns after a retry starts another run', () => {
    const scene = harness();
    let callback = () => {};
    Object.assign(scene, { time: { delayedCall: (_delay: number, action: () => void) => { callback = action; } }, spawnBoss: vi.fn() });
    scene['scheduleBoss'](700);
    scene['missionRun'] += 1;
    callback();
    expect(scene['spawnBoss']).not.toHaveBeenCalled();
  });
  it('emits spent-defense state after a real hit, never after ignored or god-mode hits', () => {
    const scene = harness('coastal');
    scene['model'].start({ ...config('coastal'), modifiers: buildCombatModifiers(['aegis-bank']) });
    expect(scene['model'].exportCheckpoint().reserveShieldAvailable).toBe(true);
    scene['damagePlayer']();
    const events = dispatched('aegis:defense-consumed');
    expect(events).toHaveLength(1);
    expect(events[0].detail.missionId).toBe('coastal');
    expect(events[0].detail.game.reserveShieldAvailable).toBe(false);
    scene['damagePlayer'](); // invulnerability window
    scene['godMode'] = true;
    scene['damagePlayer']();
    expect(dispatched('aegis:defense-consumed')).toHaveLength(1);
  });
  it('persists the consumed Nanite Lattice through the real update/tick path', () => {
    const scene = harness('coastal'), model = scene['model'];
    model.start({ ...config('coastal'), modifiers: buildCombatModifiers(['nanite-lattice']) });
    model.takeDamage(); model.tick(900); model.takeDamage(); model.tick(8000);
    for (const method of ['scrollEnvironment', 'updatePlayer', 'updateDrones', 'updateProjectiles', 'updateEnemies', 'updateMines', 'updatePickups', 'updateWaveDirector']) {
      Object.assign(scene, { [method]: vi.fn() });
    }
    scene.update(40_000, 35_000);
    const events = dispatched('aegis:defense-consumed');
    expect(events).toHaveLength(1);
    expect(events[0].detail.game.naniteLatticeAvailable).toBe(false);
    expect(events[0].detail.game.hull).toBe(3);
  });
  it('loads waypoint two through startMission after JSON refresh and never replays Seraph', () => {
    const scene = harness(), model = scene['model'];
    model.setFinalePhase('boss'); model.advanceFinaleBoss();
    model.registerKill(ENEMIES.seraph.score, ENEMIES.seraph.credits);
    scene['finaleApproachWave'] = 4;
    scene['secureWaypoint'](2);
    const saved = JSON.parse(JSON.stringify(dispatched('aegis:waypoint-secured')[0].detail)) as MissionWaypointSnapshot;
    const callbacks = installStartViews(scene);
    const { enemy } = fakeEnemy('nullArchitect');
    const spawn = vi.fn((_kind: EnemyKind) => enemy);
    Object.assign(scene, { spawnEnemy: spawn });
    scene['startMission']({ ...config('lastLight'), resumeFrom: saved });
    expect(model.finaleBossStage).toBe('nullArchitect');
    expect(model.latestWaypointId).toBe(2);
    expect(model.creditsEarned).toBe(ENEMIES.seraph.credits);
    expect(scene['finaleApproachWave']).toBe(4);
    callbacks[0]();
    expect(spawn).toHaveBeenCalledExactlyOnceWith('nullArchitect', 640, -100, 0);
    scene['updateDreadnoughtApproach']();
    expect(spawn).toHaveBeenCalledOnce();
  });
  it('a manual restart from mission start clears the sequence and cancels its pending second boss', () => {
    const scene = harness(), model = scene['model'];
    const callbacks = installStartViews(scene);
    model.setFinalePhase('boss'); model.advanceFinaleBoss();
    scene['scheduleBoss'](2600);
    const spawn = vi.fn();
    Object.assign(scene, { spawnEnemy: spawn });
    scene['startMission'](config('lastLight'));
    callbacks[0]();
    expect(model.finalePhase).toBe('approach');
    expect(model.finaleBossStage).toBe('seraph');
    expect(model.latestWaypointId).toBeUndefined();
    expect(scene['bossSpawned']).toBe(false);
    expect(scene['bossSpawnScheduled']).toBe(false);
    expect(scene['finaleApproachWave']).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
  });
  it('loads the first boss boundary without skipping Seraph', () => {
    const scene = harness(), model = scene['model'];
    model.stageElapsedMs = 36_000;
    scene['finaleApproachWave'] = 4;
    scene['updateWaveDirector'](36_000);
    const saved = JSON.parse(JSON.stringify(dispatched('aegis:waypoint-secured')[0].detail)) as MissionWaypointSnapshot;
    const callbacks = installStartViews(scene);
    const { enemy } = fakeEnemy('seraph');
    const spawn = vi.fn(() => enemy);
    Object.assign(scene, { spawnEnemy: spawn });
    scene['startMission']({ ...config('lastLight'), resumeFrom: saved });
    expect(model.latestWaypointId).toBe(1);
    expect(model.finaleBossStage).toBe('seraph');
    callbacks[0]();
    expect(spawn).toHaveBeenCalledExactlyOnceWith('seraph', 640, -100, 0);
  });
  it('the Dreadnought clears only its mission; only the final Architect produces victory', () => {
    for (const missionId of ['dreadnought', 'lastLight'] as const) {
      const scene = harness(missionId), model = scene['model'];
      const callbacks = installStartViews(scene);
      model.setFinalePhase('boss');
      if (missionId === 'lastLight') model.advanceFinaleBoss();
      scene['completeMission'](true);
      expect(model.mode).toBe(missionId === 'lastLight' ? 'victory' : 'complete');
      expect(dispatched('aegis:mission-clear')[0].detail.finalVictory).toBe(missionId === 'lastLight');
      // Restart before extraction ends. No old callbacks may touch the next mission.
      scene['startMission'](config(missionId));
      for (const callback of callbacks.slice(0, 3)) callback();
      expect(dispatched('aegis:mission-ended')).toHaveLength(0);
      expect(model.mode).toBe('playing');
    }
  });
  it('a failed run cannot emit a stale defeat event after manual retry', () => {
    const scene = harness(), model = scene['model'];
    const callbacks = installStartViews(scene);
    // Invoke the production method, rather than the damage-test render stub.
    model.mode = 'gameover';
    BattleScene.prototype['endFailedMission'].call(scene);
    scene['startMission'](config('lastLight'));
    callbacks[0]();
    expect(dispatched('aegis:mission-ended')).toHaveLength(0);
    expect(model.mode).toBe('playing');
  });
  it('keeps a pending second boss queued through pause and spawns once after resume', () => {
    const scene = harness(), model = scene['model'];
    const callbacks = installStartViews(scene);
    model.setFinalePhase('boss'); model.advanceFinaleBoss();
    const spawn = vi.fn();
    Object.assign(scene, { spawnBoss: spawn });
    scene['scheduleBoss'](2600);
    model.setPaused(true);
    callbacks[0]();
    expect(scene['bossSpawnScheduled']).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
    scene['updateWaveDirector'](5000);
    expect(scene['announce']).not.toHaveBeenCalled();
    model.setPaused(false);
    callbacks[1]();
    expect(spawn).toHaveBeenCalledExactlyOnceWith(1);
    expect(scene['bossSpawnScheduled']).toBe(false);
  });
  it('cannot capture a new waypoint or advance encounters once the fighter has died', () => {
    const scene = harness(), model = scene['model'];
    model.hull = 0;
    model.mode = 'gameover';
    model.stageElapsedMs = 36_000;
    scene['finaleApproachWave'] = 4;
    const spawn = vi.fn();
    Object.assign(scene, { spawnEnemy: spawn });
    scene['secureWaypoint'](1);
    scene['updateWaveDirector'](36_000);
    expect(dispatched('aegis:waypoint-secured')).toHaveLength(0);
    expect(model.latestWaypointId).toBeUndefined();
    expect(model.finalePhase).toBe('approach');
    expect(spawn).not.toHaveBeenCalled();
  });
  it.each(['coastal', 'aurora', 'fortress', 'stormbreak', 'graveyard'] as const)('defers %s waypoints until required command elites are gone', (missionId) => {
    const scene = harness(missionId), model = scene['model'];
    scene['commandSpawned'] = true;
    scene['commandRemaining'] = missionId === 'fortress' ? 2 : 1;
    scene['commandEncounterActive'] = false;
    scene['maybeSecureProgressWaypoint'](.7);
    scene['secureWaypoint'](1); // The central capture guard also rejects it.
    expect(model.latestWaypointId).toBeUndefined();
    expect(scene['pendingWaypointId']).toBe(1);
    expect(dispatched('aegis:waypoint-secured')).toHaveLength(0);
    scene['commandRemaining'] = 0;
    scene['maybeSecureProgressWaypoint'](.7);
    expect(model.latestWaypointId).toBe(1);
    expect(dispatched('aegis:waypoint-secured')).toHaveLength(1);
    expect(dispatched('aegis:waypoint-secured')[0].detail.encounter.commandRemaining).toBe(0);
  });
  it.each(['coastal', 'minefield', 'aurora', 'fortress', 'stormbreak', 'graveyard', 'carrierSiege'] as const)('does not commit an unspawned required target in %s', (missionId) => {
    const scene = harness(missionId);
    scene['model'].stageElapsedMs = scene['model'].stageDurationMs;
    const spawn = vi.fn(() => undefined);
    Object.assign(scene, { spawnEnemy: spawn });
    scene['maybeSpawnCommandTargets']();
    expect(scene['commandSpawned']).toBe(false);
    expect(scene['commandRemaining']).toBe(0);
    expect(scene['commandEncounterActive']).toBe(false);
    expect(scene['announce']).not.toHaveBeenCalled();
    // A transient capacity failure must be retried, not remembered as a finished formation.
    const calls = spawn.mock.calls.length;
    scene['maybeSpawnCommandTargets']();
    expect(spawn.mock.calls.length).toBeGreaterThan(calls);
  });
  it('requires the Aurora Sentinel before mission completion and delivers the fourth deterministic carrier', () => {
    const scene = harness('aurora'), { enemy } = fakeEnemy('elite');
    const spawn = vi.fn().mockReturnValueOnce(enemy);
    Object.assign(scene, {
      spawnEnemy: spawn, markCarrier: vi.fn(), configureDepthArrival: vi.fn(), completeMission: vi.fn(),
      maybeSecureProgressWaypoint: vi.fn(), maybeSpawnMiniboss: () => false, maybeIntroduceBulwark: () => false,
      maybeSpawnArmamentCarrier: vi.fn(), spawnWave: vi.fn(), spawnThreatEscorts: vi.fn(),
    });
    scene['model'].stageElapsedMs = scene['model'].stageDurationMs - 20_001;
    scene['maybeSpawnCommandTargets']();
    expect(spawn).not.toHaveBeenCalled();
    scene['model'].stageElapsedMs = scene['model'].stageDurationMs - 20_000;
    scene['maybeSpawnCommandTargets']();
    expect(spawn.mock.calls.map(([kind]) => kind)).toEqual(['elite', 'prism', 'leech']);
    expect(enemy.getData('commandTarget')).toBe(true);
    expect(scene['markCarrier']).toHaveBeenCalledExactlyOnceWith(enemy, globalCarrierIndex('aurora', 3), false);
    expect(scene['configureDepthArrival']).toHaveBeenCalledExactlyOnceWith(enemy, 1200);
    scene['model'].stageElapsedMs = scene['model'].stageDurationMs;
    scene['updateWaveDirector'](210_000);
    expect(scene['completeMission']).not.toHaveBeenCalled();
    scene['commandRemaining'] = 0;
    scene['updateWaveDirector'](211_000);
    expect(scene['completeMission']).toHaveBeenCalledExactlyOnceWith(false);
    expect(spawn).toHaveBeenCalledTimes(3);
  });
  it.each(['collection', 'expiry'] as const)('preserves a late Sentinel reward until %s, with its full twelve-second choice window', (resolution) => {
    const scene = harness('aurora'), { enemy } = fakeEnemy('elite');
    const views = installPickupViews(scene), model = scene['model'];
    installCompletedDirectorViews(scene);
    Object.assign(scene, {
      spawnEnemy: vi.fn().mockReturnValueOnce(enemy), configureDepthArrival: vi.fn(),
      markCarrier: (target: typeof enemy, index: number) => target.setData('carrierIndex', index),
    });
    scene['armamentOfferHistory'] = [['missile', 'laser'], ['spread', 'shield'], ['ion', 'drone']];
    const expected = chooseArmamentOffer(model.weapons, model.shieldBaseMax, model.campaignSeed,
      globalCarrierIndex('aurora', 3), scene['armamentOfferHistory'].flat().slice(-4), scene['armamentOfferHistory'].at(-1));
    model.stageElapsedMs = 190_000;
    scene['maybeSpawnCommandTargets']();
    expect(scene['commandRemaining']).toBe(1);
    expect(enemy.getData('carrierIndex')).toBe(globalCarrierIndex('aurora', 3));

    const killedAt = 212_000;
    scene.time.now = killedAt;
    model.stageElapsedMs = killedAt;
    scene['destroyEnemy'](enemy as never);
    expect(enemy.active).toBe(false);
    expect(scene['commandRemaining']).toBe(0);
    expect(views.pickups.map((pickup) => pickup.getData('pickup'))).toEqual(expected.options);
    expect(scene['armamentOfferHistory'].at(-1)).toEqual(expected.options);
    expect(views.pickups.map((pickup) => pickup.getData('expiresAt'))).toEqual([killedAt + 12_000, killedAt + 12_000]);
    expect(views.pickups[0].getData('pairId')).toBe(views.pickups[1].getData('pairId'));
    scene['updateWaveDirector'](killedAt);
    expect(scene['completeMission']).not.toHaveBeenCalled();
    expect(scene['spawnWave']).not.toHaveBeenCalled();
    expect(scene['spawnThreatEscorts']).not.toHaveBeenCalled();

    scene.time.now = killedAt + 11_999;
    model.stageElapsedMs = killedAt + 11_999;
    scene['updatePickups'](16);
    scene['updateWaveDirector'](scene.time.now);
    expect(views.pickups.every((pickup) => pickup.active)).toBe(true);
    expect(scene['completeMission']).not.toHaveBeenCalled();
    expect(scene['spawnWave']).not.toHaveBeenCalled();
    expect(scene['spawnThreatEscorts']).not.toHaveBeenCalled();
    if (resolution === 'collection') {
      const chosen = views.pickups[0].getData('pickup') as UpgradeType;
      const previousLevel = chosen === 'shield' ? model.shieldBaseMax : model.weapons[chosen];
      views.collect(views.pickups[0]);
      expect(chosen === 'shield' ? model.shieldBaseMax : model.weapons[chosen]).toBe(previousLevel + 1);
      expect(scene['emitRadio']).toHaveBeenCalledOnce();
    } else {
      scene.time.now = killedAt + 12_000;
      model.stageElapsedMs = killedAt + 12_000;
      scene['updatePickups'](1);
      expect(scene['emitRadio']).not.toHaveBeenCalled();
    }
    expect(views.pickups.every((pickup) => !pickup.active)).toBe(true);
    scene['updateWaveDirector'](scene.time.now);
    expect(scene['completeMission']).toHaveBeenCalledExactlyOnceWith(false);
    expect(scene['spawnWave']).not.toHaveBeenCalled();
    expect(scene['spawnThreatEscorts']).not.toHaveBeenCalled();
  });
  it.each(['coastal', 'minefield', 'aurora', 'fortress', 'stormbreak', 'graveyard', 'carrierSiege'] as const)(
    'also waits for unresolved Armament choices after the %s mission timer', (missionId) => {
      const scene = harness(missionId);
      const { pickups } = installPickupViews(scene);
      installCompletedDirectorViews(scene);
      scene['commandSpawned'] = true;
      scene['commandRemaining'] = 0;
      scene['model'].stageElapsedMs = scene['model'].stageDurationMs;
      scene['spawnArmamentOffer'](640, 125, globalCarrierIndex(missionId, 3));
      scene['updateWaveDirector'](scene.time.now);
      expect(pickups).toHaveLength(2);
      expect(scene['completeMission']).not.toHaveBeenCalled();
      expect(scene['spawnWave']).not.toHaveBeenCalled();
      expect(scene['spawnThreatEscorts']).not.toHaveBeenCalled();
      scene.time.now += 12_000;
      scene['model'].stageElapsedMs += 12_000;
      scene['updatePickups'](16);
      scene['updateWaveDirector'](scene.time.now);
      expect(scene['completeMission']).toHaveBeenCalledExactlyOnceWith(false);
      expect(scene['spawnWave']).not.toHaveBeenCalled();
      expect(scene['spawnThreatEscorts']).not.toHaveBeenCalled();
    },
  );
  it.each(['utility', 'inactive pair'] as const)('does not let an uncollected %s delay extraction', (kind) => {
    const scene = harness('aurora');
    const views = installPickupViews(scene);
    installCompletedDirectorViews(scene);
    scene['commandSpawned'] = true;
    scene['commandRemaining'] = 0;
    scene['model'].stageElapsedMs = scene['model'].stageDurationMs;
    if (kind === 'utility') {
      views.pickups.push(views.sprite(640, 400).setData('pickup', 'repair'));
    } else {
      scene['spawnArmamentOffer'](640, 125, globalCarrierIndex('aurora', 3));
      views.pickups.forEach((pickup) => pickup.disableBody());
    }
    scene['updateWaveDirector'](scene.time.now);
    expect(scene['completeMission']).toHaveBeenCalledExactlyOnceWith(false);
    expect(scene['spawnWave']).not.toHaveBeenCalled();
  });
  it('reserves both Fortress command slots and counts only actual spawned leaders', () => {
    const scene = harness('fortress');
    scene['model'].stageElapsedMs = scene['model'].stageDurationMs;
    const { enemy } = fakeEnemy('elite');
    const spawn = vi.fn().mockReturnValueOnce(enemy).mockReturnValue(undefined);
    Object.assign(scene, { spawnEnemy: spawn, markCarrier: vi.fn(), configureDepthArrival: vi.fn() });
    Object.assign(scene['enemies'], { countActive: () => MAX_ACTIVE_ENEMIES - 1 });
    scene['maybeSpawnCommandTargets']();
    expect(spawn).not.toHaveBeenCalled();
    expect(scene['commandSpawned']).toBe(false);
    Object.assign(scene['enemies'], { countActive: () => MAX_ACTIVE_ENEMIES - 2 });
    scene['maybeSpawnCommandTargets']();
    expect(scene['commandSpawned']).toBe(true);
    expect(scene['commandRemaining']).toBe(1);
    expect(enemy.getData('commandTarget')).toBe(true);
  });
  it('does not restore encounter cursors or schedule bosses from a rejected resume snapshot', () => {
    const scene = harness(), model = scene['model'];
    model.setFinalePhase('boss'); model.advanceFinaleBoss();
    scene['finaleApproachWave'] = 4;
    scene['waveIndex'] = 17;
    scene['secureWaypoint'](2);
    const rejected = JSON.parse(JSON.stringify(dispatched('aegis:waypoint-secured')[0].detail)) as MissionWaypointSnapshot;
    rejected.encounter.commandRemaining = 1;
    const callbacks = installStartViews(scene);
    scene['startMission']({ ...config('lastLight'), resumeFrom: rejected });
    expect(model.latestWaypointId).toBeUndefined();
    expect(model.finalePhase).toBe('approach');
    expect(model.finaleBossStage).toBe('seraph');
    expect(scene['waveIndex']).toBe(0);
    expect(scene['finaleApproachWave']).toBe(0);
    expect(scene['commandRemaining']).toBe(0);
    expect(scene['bossSpawnScheduled']).toBe(false);
    expect(callbacks).toHaveLength(0);
  });
  it.each([
    [false, 'standard'], [false, 'heavy'], [false, 'ion'],
    [true, 'standard'], [true, 'heavy'], [true, 'ion'],
  ] as const)('uses directional hostile art in dimensional=%s for %s without changing collision', (dimensional, kind) => {
    const scene = harness();
    const art = HOSTILE_PROJECTILE_ART[kind];
    const body = { enable: false, velocity: { x: 0, y: 0 }, setCircle: vi.fn() };
    const bullet = {
      width: art.width, height: art.height, body,
      setTexture: vi.fn(() => bullet), setPosition: vi.fn(() => bullet), setActive: vi.fn(() => bullet),
      setVisible: vi.fn(() => bullet), setDepth: vi.fn(() => bullet), setScale: vi.fn(() => bullet),
      setAlpha: vi.fn(() => bullet), clearTint: vi.fn(() => bullet), setRotation: vi.fn(() => bullet),
      setDataEnabled: vi.fn(() => bullet), setData: vi.fn(() => bullet),
    };
    const get = vi.fn(() => bullet), velocityFromRotation = vi.fn();
    Object.assign(scene, { dimensional, enemyBullets: { countActive: () => 0, get }, physics: { velocityFromRotation } });
    const angle = Math.PI * .83;
    scene['spawnEnemyBullet'](300, 200, angle, kind === 'heavy', kind === 'ion');
    expect(get).toHaveBeenCalledExactlyOnceWith(300, 200, art.key);
    expect(bullet.setRotation).toHaveBeenCalledExactlyOnceWith(angle - Math.PI / 2);
    expect(bullet.clearTint).toHaveBeenCalledOnce();
    expect(bullet.setScale).toHaveBeenCalledExactlyOnceWith(1);
    expect(body.setCircle).toHaveBeenCalledExactlyOnceWith(art.radius, art.width / 2 - art.radius, art.height / 2 - art.radius);
    expect(velocityFromRotation.mock.calls[0][0]).toBe(angle);
    expect(velocityFromRotation.mock.calls[0][2]).toBe(body.velocity);
    expect(body.enable).toBe(true);
  });
});
