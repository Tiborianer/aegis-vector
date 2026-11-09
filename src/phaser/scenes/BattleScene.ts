import Phaser from 'phaser';
import type { RadioCue, SoundCue } from '../../audio/SoundEngine';
import { ASSET_KEYS } from '../../game/assets/manifest';
import { HOSTILE_PROJECTILE_ART } from '../../game/assets/hostileProjectiles';
import { bankFrame, easeBank, isGraphicsPreview, NEUTRAL_BANK, shipKey, shipTextureDensity, visualLateralSpeed, type ShipKind } from '../../game/assets/visuals';
import { isMissionLab, readMissionLabOptions } from '../../game/testing/missionLab';
import { DimensionalEnvironment } from '../view/DimensionalEnvironment';
import { ClassicSpaceEnvironment } from '../view/ClassicSpaceEnvironment';
import { PlayerShieldView } from '../view/PlayerShieldView';
import { currentShieldStyle } from '../view/shieldStyles';
import { createSeraphModules, createSiegeModules, drawSeraphModules, drawSiegeModules } from '../view/bossModulesView';
import { activeTurretCount, buildTurretVolley, createModularBoss, damageModularBoss, encounterHealthProgress, modularHealthRatio, seraphCollisionRects, seraphWingPose, siegeTurretPose, stepSiegeTurretAim, stepSiegeFlight, SIEGE_HULL_RECTS, SIEGE_TURRETS, type ModularBossState, type ModularVolley, type ModuleDamageTarget } from '../../game/simulation/modularBoss';
import { createFlightMotion, stepFlightMotion, steerVelocity, type FlightMotion, type FlightProfile } from '../../game/simulation/flightMotion';
import { buildEnemyVolley, bossPhase, type PatternEnemy } from '../../game/simulation/enemyPatterns';
import { isFinaleMission, finaleBossKind } from '../../game/content/finale';
import { restoreEncounterCursor } from '../../game/simulation/checkpoints';
import {
  DIFFICULTY,
  ENEMIES,
  getArcVolley,
  getNovaVolley,
  MAX_ACTIVE_ENEMIES,
  MAX_ACTIVE_MINES,
  MAX_HOSTILE_PROJECTILES,
  PICKUP_HORIZONTAL_MARGIN,
  PLAYER_COMBAT_MIN_Y,
  STATIONARY_PICKUP_SAFE_Y,
  WEAPON_LABELS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../game/content/balance';
import {
  auroraWave,
  carrierKind,
  carrierMilestones,
  COASTAL_FIRST_SALVO_WARNING_MS,
  EncounterDirector,
  getThreatTuning,
  globalCarrierIndex,
  isCoastalOpening,
} from '../../game/content/encounters';
import {
  canTractorPickup,
  chooseArmamentOffer,
  chooseUtilityPickup,
  isUtilityPickup,
  shouldDropUtility,
} from '../../game/content/pickups';
import { droneFormation } from '../../game/content/drones';
import { minibossForMission } from '../../game/content/minibosses';
import { GameModel } from '../../game/simulation/GameModel';
import type {
  EnemyKind,
  EnemyHitboxRect,
  EnemyHitZoneRole,
  GameSnapshot,
  EncounterCheckpointSnapshot,
  MissionWaypointId,
  MissionWaypointSnapshot,
  MissionStartConfig,
  PickupType,
  GraphicsQuality,
  UpgradeType,
  UtilityPickupType,
  WeaponType,
} from '../../game/simulation/types';

interface DebugBridge {
  getState: () => GameSnapshot;
  damagePlayer: () => void;
  grantPickup: (type: PickupType) => void;
  spawnEnemy: (kind: EnemyKind) => void;
  previewEnemy: (kind: EnemyKind) => void;
  spawnBoss: () => void;
  activateEmp: () => void;
  completeMission: () => void;
}

declare global {
  interface Window {
    __AEGIS_DEBUG__?: DebugBridge;
  }
}

const event = <T>(name: string, detail?: T): void => {
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

const SPECIALISTS: EnemyKind[] = ['charger', 'sniper', 'mineLayer', 'shieldCarrier', 'bulwark', 'phantom', 'artillery', 'reclaimer', 'skimmer', 'weaver', 'prism', 'leech'];
const COMMAND_ENEMIES: readonly string[] = ['boss', 'warden', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer', 'seraph', 'nullArchitect'];
const EXPANSION_BOSSES: readonly string[] = ['seraph', 'nullArchitect'];

const STANDARD_HITBOXES: readonly EnemyHitboxRect[] = [
  { role: 'core', x: 0, y: -0.05, width: 0.28, height: 0.8 },
  { role: 'wing', x: 0, y: 0.04, width: 0.94, height: 0.3 },
  { role: 'wing', x: 0, y: 0.3, width: 0.58, height: 0.2 },
];

const LARGE_HITBOXES: readonly EnemyHitboxRect[] = [
  { role: 'core', x: 0, y: -0.02, width: 0.34, height: 0.82 },
  { role: 'wing', x: 0, y: 0.04, width: 0.96, height: 0.34 },
  { role: 'wing', x: 0, y: 0.3, width: 0.68, height: 0.23 },
];

const BULWARK_HITBOXES: readonly EnemyHitboxRect[] = [
  { role: 'core', x: 0, y: -0.02, width: 0.35, height: 0.82 },
  { role: 'wing', x: -0.28, y: 0.12, width: 0.38, height: 0.3 },
  { role: 'wing', x: 0.28, y: 0.12, width: 0.38, height: 0.3 },
  { role: 'weakpoint', x: -0.29, y: 0.04, width: 0.18, height: 0.28 },
  { role: 'weakpoint', x: 0.29, y: 0.04, width: 0.18, height: 0.28 },
];

const ARTILLERY_HITBOXES: readonly EnemyHitboxRect[] = [
  { role: 'core', x: 0, y: 0.02, width: 0.38, height: 0.78 },
  { role: 'wing', x: 0, y: 0.12, width: 0.94, height: 0.34 },
  { role: 'weakpoint', x: 0, y: -0.22, width: 0.2, height: 0.24 },
];

const CARRIER_BOSS_HITBOXES: readonly EnemyHitboxRect[] = [
  { role: 'core', x: 0, y: 0, width: 0.38, height: 0.82 },
  { role: 'wing', x: 0, y: 0.12, width: 0.96, height: 0.34 },
  { role: 'weakpoint', x: -0.3, y: 0.05, width: 0.2, height: 0.34 },
  { role: 'weakpoint', x: 0.3, y: 0.05, width: 0.2, height: 0.34 },
];

const GATEKEEPER_HITBOXES: readonly EnemyHitboxRect[] = [
  { role: 'core', x: 0, y: 0.02, width: 0.42, height: 0.78 },
  { role: 'wing', x: 0, y: 0.14, width: 0.96, height: 0.32 },
  { role: 'weakpoint', x: -0.32, y: 0.06, width: 0.2, height: 0.3 },
  { role: 'weakpoint', x: 0.32, y: 0.06, width: 0.2, height: 0.3 },
];

const OVERDRIVE_CORE = 0xfff6cf;
const OVERDRIVE_GOLD = 0xffb640;

export class BattleScene extends Phaser.Scene {
  private model = new GameModel(BattleScene.loadHighScore());
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyHitZones!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private mines!: Phaser.Physics.Arcade.Group;
  private horizonHaze!: Phaser.GameObjects.TileSprite;
  private ocean!: Phaser.GameObjects.TileSprite;
  private midground!: Phaser.GameObjects.TileSprite;
  private clouds!: Phaser.GameObjects.TileSprite;
  private foreground!: Phaser.GameObjects.TileSprite;
  private ambientWash!: Phaser.GameObjects.Rectangle;
  private dimensional = false;
  private dimensionalEnvironment?: DimensionalEnvironment;
  private classicSpaceEnvironment?: ClassicSpaceEnvironment;
  private playerBank = 0;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private playerShield?: PlayerShieldView;
  private contrails!: Phaser.GameObjects.Graphics;
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'Z' | 'SPACE', Phaser.Input.Keyboard.Key>;
  private drones: Phaser.GameObjects.Sprite[] = [];
  private transientViews = new Set<Phaser.GameObjects.GameObject>();
  private nextWaveAt = 0;
  private nextPrimaryAt = 0;
  private nextMissileAt = 0;
  private nextLaserAt = 0;
  private nextDroneAt = 0;
  private nextIonAt = 0;
  private droneVolleyIndex = 0;
  private primaryVolleyIndex = 0;
  private resonanceHits = 0;
  private waveIndex = 0;
  private lastHudAt = 0;
  private entityId = 0;
  private debugSpecialistIndex = 0;
  private commandSpawned = false;
  private commandRemaining = 0;
  private commandEncounterActive = false;
  private minibossSpawned = false;
  private finaleApproachWave = 0;
  private boss?: Phaser.Physics.Arcade.Sprite;
  private bossSpawned = false;
  private bossSpawnScheduled = false;
  private missionEnding = false;
  private debugMode = false;
  private isolatedCraftPreview = false;
  private godMode = false;
  private damageAttempts = 0;
  private lastDamageResult = 'none';
  private enemyMotionDelta = 16;
  private missionRun = 0;
  private nextCarrierIndex = 0;
  private killsSinceUtilityDrop = 0;
  private offerId = 0;
  private lastThreatLevel = 1;
  private encounterDirector?: EncounterDirector;
  private graphicsQuality: GraphicsQuality = 'auto';
  private hitboxDebug = false;
  private hitboxGraphics?: Phaser.GameObjects.Graphics;
  private bulwarkIntroduced = false;
  private lastUtility?: UtilityPickupType;
  private armamentOfferHistory: Array<readonly [UpgradeType, UpgradeType]> = [];
  private hullCriticalAnnounced = false;
  private pendingWaypointId?: MissionWaypointId;

  private readonly startHandler = (raw: Event): void => {
    this.startMission((raw as CustomEvent<MissionStartConfig>).detail);
  };

  private readonly pauseHandler = (): void => this.setPaused(true);
  private readonly resumeHandler = (): void => this.setPaused(false);
  private readonly empHandler = (): void => this.activateEmp();

  constructor() {
    super('battle');
  }

  // Phaser Clock.now is wall time, even when its TimerEvents are paused.
  // Combat deadlines and animation phases share the model's playing-only clock.
  private get combatNow(): number {
    return this.model.stageElapsedMs;
  }

  create(): void {
    const query = new URLSearchParams(window.location.search);
    this.debugMode = query.get('debug') === '1' || isMissionLab(window.location.search);
    this.godMode = isMissionLab(window.location.search)
      ? readMissionLabOptions(window.location.search).godMode
      : this.debugMode && query.get('god') === '1';
    this.hitboxDebug = this.debugMode && query.get('collisionDebug') === '1';
    this.graphicsQuality = this.resolveGraphicsQuality();
    this.dimensional = this.registry.get('visualStyle') === 'dimensional';
    this.createEnvironment();
    this.createPhysicsGroups();
    this.createPlayer();
    this.createInput();
    this.createCollisions();

    window.addEventListener('aegis:start-mission', this.startHandler);
    window.addEventListener('aegis:pause', this.pauseHandler);
    window.addEventListener('aegis:resume', this.resumeHandler);
    window.addEventListener('aegis:emp', this.empHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('aegis:start-mission', this.startHandler);
      window.removeEventListener('aegis:pause', this.pauseHandler);
      window.removeEventListener('aegis:resume', this.resumeHandler);
      window.removeEventListener('aegis:emp', this.empHandler);
      this.dimensionalEnvironment?.destroy();
      this.classicSpaceEnvironment?.destroy();
      this.playerShield?.destroy();
    });

    window.__AEGIS_DEBUG__ = {
      getState: () => this.model.snapshot(),
      damagePlayer: () => this.damagePlayer(true),
      grantPickup: (type) => this.collectPickup(type),
      spawnEnemy: (kind) => { this.spawnEnemy(kind, WORLD_WIDTH / 2, 110, 0); },
      previewEnemy: (kind) => this.previewEnemy(kind),
      spawnBoss: () => this.spawnBoss(),
      activateEmp: () => this.activateEmp(),
      completeMission: () => this.debugCompleteMission(),
    };

    event('aegis:ready');
    this.emitState(true);
  }

  update(_wallTime: number, delta: number): void {
    if (this.model.mode !== 'paused') this.scrollEnvironment(delta);
    if (this.model.mode !== 'playing') {
      if (this.model.mode !== 'paused') this.playerShield?.update(this.player.x, this.player.y, this.player.rotation, this.model.shield, this.model.shieldMax, this.combatNow, false);
      return;
    }

    const restoration = this.model.tick(delta);
    const time = this.combatNow;
    if (restoration === 'shield') {
      this.shieldPulse(0x35e8ff, 1.2);
      this.emitSound('shield-ready');
      this.announce('SHIELD ENERGY RESTORED');
      this.emitRadio('shield-restored');
      if (this.model.modifiers.guardianPulse) this.clearEnemyBullets(this.player.x, this.player.y, 90);
    } else if (restoration === 'hull') {
      this.emitConsumedDefenses();
      this.emitSound('pickup');
      this.announce('NANITE LATTICE // HULL RESTORED');
    }
    if (this.model.hull > 1) this.hullCriticalAnnounced = false;

    this.updatePlayer(time, delta);
    this.playerShield?.update(this.player.x, this.player.y, this.player.rotation, this.model.shield, this.model.shieldMax, time, true);
    this.hitboxGraphics?.clear();
    this.updateDrones(delta);
    this.updateProjectiles(delta);
    this.updateEnemies(time, delta);
    this.updateMines(time, delta);
    if (this.model.mode !== 'playing') return;
    this.updatePickups(delta);
    this.updateWaveDirector(time);
    this.emitState(time - this.lastHudAt > 70);
  }

  private createEnvironment(): void {
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x050b19).setDepth(-20);
    this.horizonHaze = this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, ASSET_KEYS.haze)
      .setDepth(-19)
      .setAlpha(0.78);
    this.ocean = this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, ASSET_KEYS.ocean).setDepth(-18);
    this.midground = this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, ASSET_KEYS.coastal)
      .setDepth(-17)
      .setAlpha(0.52);
    this.clouds = this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, ASSET_KEYS.cloud)
      .setDepth(-16)
      .setAlpha(0.34);
    this.foreground = this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, ASSET_KEYS.foreground)
      .setDepth(0)
      .setAlpha(0.17)
      .setBlendMode(Phaser.BlendModes.ADD);
    if (this.graphicsQuality === 'low') this.foreground.setVisible(false);
    if (this.graphicsQuality === 'balanced') this.foreground.setAlpha(0.1);
    this.ambientWash = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x35e8ff, 0.018)
      .setDepth(-2)
      .setBlendMode(Phaser.BlendModes.ADD);

    const horizon = this.add.graphics().setDepth(-15);
    horizon.lineStyle(2, 0x35e8ff, 0.1).lineBetween(0, 172, WORLD_WIDTH, 172);
    horizon.fillStyle(0x35e8ff, 0.12);
    for (let x = 20; x < WORLD_WIDTH; x += 73) horizon.fillCircle(x, 170 + (x % 3) * 5, x % 5 === 0 ? 3 : 2);

    if (this.dimensional) {
      [this.horizonHaze, this.ocean, this.midground, this.clouds, this.foreground, horizon].forEach((view) => view.setVisible(false));
      this.dimensionalEnvironment = new DimensionalEnvironment(this, this.graphicsQuality);
    } else {
      this.classicSpaceEnvironment = new ClassicSpaceEnvironment(this, this.graphicsQuality,
        [this.horizonHaze, this.ocean, this.midground, this.clouds, this.foreground, horizon, this.ambientWash]);
    }

    this.particles = this.add.particles(0, 0, ASSET_KEYS.spark, {
      lifespan: { min: 260, max: 620 },
      speed: { min: 35, max: 210 },
      scale: { start: 0.85, end: 0 },
      alpha: { start: 0.9, end: 0 },
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(8);
  }

  private scrollEnvironment(delta: number): void {
    if (this.dimensionalEnvironment) {
      const density = this.enemyBullets ? Math.min(1, this.enemyBullets.countActive(true) / 36) : 0;
      this.dimensionalEnvironment.update(delta, this.player?.x ?? WORLD_WIDTH / 2, density);
      return;
    }
    if (this.classicSpaceEnvironment?.update(delta, this.player?.x ?? WORLD_WIDTH / 2,
      this.enemyBullets ? Math.min(1, this.enemyBullets.countActive(true) / 36) : 0)) return;
    const forward = delta * 0.08;
    this.horizonHaze.tilePositionY -= forward * 0.15;
    this.ocean.tilePositionY -= forward * 0.35;
    this.ocean.tilePositionX += delta * 0.006;
    this.midground.tilePositionY -= forward * 0.6;
    this.clouds.tilePositionY -= forward * 0.85;
    this.clouds.tilePositionX += delta * 0.004;
    this.foreground.tilePositionY -= forward * 1.15;
    this.foreground.tilePositionX -= delta * 0.011;
    const projectileDensity = this.enemyBullets ? Math.min(1, this.enemyBullets.countActive(true) / 36) : 0;
    if (this.foreground.visible) {
      const qualityAlpha = this.graphicsQuality === 'high' ? 0.17 : 0.1;
      this.foreground.setAlpha(qualityAlpha * (1 - projectileDensity * 0.65));
    }
  }

  private resolveGraphicsQuality(): GraphicsQuality {
    const requested = new URLSearchParams(window.location.search).get('quality');
    if (requested === 'high' || requested === 'balanced' || requested === 'low') return requested;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'low';
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    if (memory <= 4 || cores <= 4) return 'low';
    if (memory <= 8 || cores <= 6) return 'balanced';
    return 'high';
  }

  private createPhysicsGroups(): void {
    this.playerBullets = this.physics.add.group({ maxSize: 180, runChildUpdate: false });
    this.enemyBullets = this.physics.add.group({ maxSize: MAX_HOSTILE_PROJECTILES, runChildUpdate: false });
    this.enemies = this.physics.add.group({ maxSize: MAX_ACTIVE_ENEMIES, runChildUpdate: false });
    this.enemyHitZones = this.physics.add.group({ runChildUpdate: false });
    this.pickups = this.physics.add.group({ runChildUpdate: false });
    this.mines = this.physics.add.group({ maxSize: MAX_ACTIVE_MINES, runChildUpdate: false });
    if (this.hitboxDebug) this.hitboxGraphics = this.add.graphics().setDepth(20);
  }

  private createPlayer(): void {
    this.playerShadow = this.add.ellipse(WORLD_WIDTH / 2 + 14, WORLD_HEIGHT - 68, 58, 18, 0x01040a, 0.5)
      .setDepth(2)
      .setVisible(false);
    this.contrails = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.player = this.physics.add.sprite(WORLD_WIDTH / 2, WORLD_HEIGHT - 110, this.shipTexture('player'), this.dimensional ? NEUTRAL_BANK : undefined)
      .setDepth(6)
      .setVisible(false)
      .setActive(false);
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(28, 42).setOffset(30, 31);
    this.playerShield = new PlayerShieldView(this, currentShieldStyle());

    for (let index = 0; index < 5; index += 1) {
      this.drones.push(this.add.sprite(this.player.x, this.player.y, this.shipTexture('drone'), this.dimensional ? NEUTRAL_BANK : undefined).setDepth(5).setVisible(false));
    }
  }

  private shipTexture(kind: ShipKind): string {
    return this.dimensional ? shipKey(kind) : ASSET_KEYS[kind];
  }

  private createInput(): void {
    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable.');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,Z,SPACE') as typeof this.keys;
    const activateEmp = (_key: Phaser.Input.Keyboard.Key, event?: KeyboardEvent): void => {
      if (event?.repeat) return;
      this.activateEmp();
    };
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X).on('down', activateEmp);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT).on('down', activateEmp);
    let pauseKeyHeld = false;
    const togglePause = (_key: Phaser.Input.Keyboard.Key, event?: KeyboardEvent): void => {
      if (pauseKeyHeld || event?.repeat) return;
      pauseKeyHeld = true;
      if (this.missionEnding) return;
      if (this.model.mode === 'playing') this.setPaused(true);
      else if (this.model.mode === 'paused') this.setPaused(false);
    };
    const releasePause = (): void => { pauseKeyHeld = false; };
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', togglePause).on('up', releasePause);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P).on('down', togglePause).on('up', releasePause);
    // Phaser resets native keys on these events without emitting their `up`
    // handlers. Reset our shared latch too if the release happened off-window.
    this.game.events.on(Phaser.Core.Events.BLUR, releasePause);
    this.events.on(Phaser.Scenes.Events.PAUSE, releasePause);
    this.events.on(Phaser.Scenes.Events.SLEEP, releasePause);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, releasePause);
      this.events.off(Phaser.Scenes.Events.PAUSE, releasePause);
      this.events.off(Phaser.Scenes.Events.SLEEP, releasePause);
    });
    if (this.debugMode) {
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE).on('down', () => this.collectPickup('spread'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO).on('down', () => this.collectPickup('missile'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE).on('down', () => this.collectPickup('laser'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR).on('down', () => this.collectPickup('drone'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE).on('down', () => this.collectPickup('shield'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX).on('down', () => this.collectPickup('emp'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I).on('down', () => this.collectPickup('ion'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.O).on('down', () => this.collectPickup('overdrive'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T).on('down', () => this.collectPickup('tractor'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B).on('down', () => this.spawnBoss());
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H).on('down', () => this.damagePlayer(true));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C).on('down', () => this.debugCompleteMission());
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N).on('down', () => {
        const kind = SPECIALISTS[this.debugSpecialistIndex % SPECIALISTS.length];
        this.debugSpecialistIndex += 1;
        this.spawnEnemy(kind, WORLD_WIDTH / 2, 118, this.debugSpecialistIndex);
      });
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V).on('down', () => this.debugSpawnWarden());
    }
  }

  private createCollisions(): void {
    this.physics.add.overlap(this.playerBullets, this.enemyHitZones, (bullet, zone) => {
      this.hitEnemy(bullet as Phaser.Physics.Arcade.Sprite, zone as Phaser.GameObjects.Zone);
    });
    this.physics.add.overlap(this.playerBullets, this.mines, (bullet, mine) => {
      this.hitMine(bullet as Phaser.Physics.Arcade.Sprite, mine as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.player, this.enemyBullets, (_player, bullet) => {
      const projectile = bullet as Phaser.Physics.Arcade.Sprite;
      if (!projectile.active) return;
      if (this.model.modifiers.kineticReversal && this.model.shield > 0) this.reflectHostileBullet(projectile);
      this.disableBody(projectile);
      this.damagePlayer(false, 'projectile');
    });
    this.physics.add.overlap(this.player, this.enemyHitZones, (_player, hitZone) => {
      const zone = hitZone as Phaser.GameObjects.Zone;
      const target = zone.getData('enemy') as Phaser.Physics.Arcade.Sprite;
      if (!target?.active || target.getData('combatReady') === false) return;
      const lastRamAt = (target.getData('lastRamAt') as number | undefined) ?? Number.NEGATIVE_INFINITY;
      if (this.combatNow - lastRamAt < 250) return;
      target.setData('lastRamAt', this.combatNow);
      this.damagePlayer(false, 'ram');
      const kind = target.getData('kind') as EnemyKind;
      if (!COMMAND_ENEMIES.includes(kind)) this.damageEnemy(target, 8);
    });
    this.physics.add.overlap(this.player, this.mines, (_player, mine) => {
      const target = mine as Phaser.Physics.Arcade.Sprite;
      if (!target.active || !target.getData('armed')) return;
      this.destroyMine(target);
      this.damagePlayer(false, 'hazard');
    });
    this.physics.add.overlap(this.player, this.pickups, (_player, pickup) => {
      const target = pickup as Phaser.Physics.Arcade.Sprite;
      if (!target.active) return;
      const type = target.getData('pickup') as PickupType;
      const pairId = target.getData('pairId') as number | undefined;
      this.disableBody(target);
      if (pairId !== undefined) {
        this.pickups.children.each((child) => {
          const sibling = child as Phaser.Physics.Arcade.Sprite;
          if (sibling.active && sibling !== target && sibling.getData('pairId') === pairId) sibling.destroy();
          return true;
        });
      }
      this.collectPickup(type);
    });
  }

  private startMission(config: MissionStartConfig): void {
    if (!config) return;
    // The lab launches in place to retain the user's audio activation. Its
    // checkbox can change between sorties, without recreating this scene.
    if (isMissionLab(window.location.search)) this.godMode = readMissionLabOptions(window.location.search).godMode;
    this.isolatedCraftPreview = false;
    this.missionRun += 1;
    this.time.removeAllEvents();
    this.time.clearPendingEvents();
    this.time.paused = false;
    this.tweens.killAll();
    this.tweens.timeScale = 1;
    this.physics.world.resume();
    this.clearBattlefield();
    this.commandSpawned = false;
    this.commandRemaining = 0;
    this.commandEncounterActive = false;
    this.minibossSpawned = false;
    this.finaleApproachWave = 0;
    this.boss = undefined;
    this.bossSpawned = false;
    this.bossSpawnScheduled = false;
    this.missionEnding = false;
    this.damageAttempts = 0;
    this.lastDamageResult = 'none';
    this.waveIndex = 0;
    this.entityId = 0;
    this.nextPrimaryAt = 0;
    this.nextMissileAt = 0;
    this.nextLaserAt = 0;
    this.nextDroneAt = 0;
    this.nextIonAt = 0;
    this.droneVolleyIndex = 0;
    this.primaryVolleyIndex = 0;
    this.resonanceHits = 0;
    this.nextCarrierIndex = 0;
    this.killsSinceUtilityDrop = 0;
    this.offerId = 0;
    this.lastThreatLevel = 1;
    this.bulwarkIntroduced = false;
    this.lastUtility = undefined;
    this.armamentOfferHistory = [];
    this.hullCriticalAnnounced = false;
    this.pendingWaypointId = undefined;
    this.model.start(config);
    this.playerShield?.reset();
    this.playerShield?.setStyle(currentShieldStyle());
    this.playerBank = 0;
    this.dimensionalEnvironment?.setMission(config.mission.id);
    this.classicSpaceEnvironment?.setMission(config.mission.id);
    this.encounterDirector = new EncounterDirector(config.campaignSeed, config.difficulty, config.mission.id);
    // The model validates imported saves. Never restore render cursors from a rejected save.
    const acceptedResume = this.model.latestWaypointId !== undefined ? config.resumeFrom : undefined;
    if (acceptedResume) this.restoreEncounterCheckpoint(acceptedResume);

    const missionTints: Record<string, number> = {
      coastal: 0xffffff,
      minefield: 0xd9f7d9,
      aurora: 0xdaf8ff,
      fortress: 0xd6d7ff,
      stormbreak: 0xc8d9ff,
      graveyard: 0xd0ffe9,
      carrierSiege: 0xffe3ba,
      dreadnought: 0xffd5dc,
      lastLight: 0xddccff,
    };
    const environmentKeys: Record<string, string> = {
      coastal: ASSET_KEYS.coastal,
      minefield: ASSET_KEYS.minefield,
      aurora: ASSET_KEYS.aurora,
      fortress: ASSET_KEYS.fortress,
      stormbreak: ASSET_KEYS.stormbreak,
      graveyard: ASSET_KEYS.graveyard,
      carrierSiege: ASSET_KEYS.carrierSiege,
      dreadnought: ASSET_KEYS.dreadnought,
      lastLight: ASSET_KEYS.dreadnought,
    };
    const accentColors: Record<string, number> = {
      coastal: 0x35e8ff,
      minefield: 0x45ff9c,
      aurora: 0x79f7da,
      fortress: 0x9d7dff,
      stormbreak: 0x67ecff,
      graveyard: 0x65ffb1,
      carrierSiege: 0xffb640,
      dreadnought: 0xff3f56,
      lastLight: 0x9d7dff,
    };
    this.ocean.setTint(missionTints[config.mission.id] ?? 0xffffff);
    this.clouds.setTint(missionTints[config.mission.id] ?? 0xffffff);
    this.horizonHaze.setTint(missionTints[config.mission.id] ?? 0xffffff);
    this.midground.setTexture(environmentKeys[config.mission.id] ?? ASSET_KEYS.coastal);
    this.ambientWash.setFillStyle(accentColors[config.mission.id] ?? 0x35e8ff, isFinaleMission(config.mission.id) ? 0.035 : 0.018);
    this.player.setPosition(WORLD_WIDTH / 2, WORLD_HEIGHT - 110).setVisible(true).setActive(true).setAlpha(1);
    this.playerShadow.setVisible(true);
    this.contrails.setVisible(true);
    (this.player.body as Phaser.Physics.Arcade.Body).enable = true;
    this.nextWaveAt = this.combatNow + 1_100;
    if (acceptedResume && isFinaleMission(config.mission.id) && acceptedResume.game.finalePhase === 'boss') {
      this.bossSpawned = false;
      this.scheduleBoss(700, acceptedResume.bossHealthRatio ?? 1);
    }
    this.cameras.main.fadeIn(500, 2, 8, 18);
    this.announce(`${config.mission.sector} // ${config.mission.title}`);
    event('aegis:music', config.mission.music);
    this.emitState(true);
  }

  private clearBattlefield(): void {
    for (const group of [this.playerBullets, this.enemyBullets, this.enemies, this.enemyHitZones, this.pickups, this.mines]) group.clear(true, true);
    this.transientViews.forEach((view) => view.destroy());
    this.transientViews.clear();
    this.drones.forEach((drone) => drone.setVisible(false));
  }

  private updatePlayer(time: number, delta: number): void {
    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;
    const direction = new Phaser.Math.Vector2(x, y).normalize();
    this.player.setVelocity(direction.x * 430, direction.y * 430);

    if (this.player.y < PLAYER_COMBAT_MIN_Y) {
      this.player.y = PLAYER_COMBAT_MIN_Y;
      this.player.setVelocityY(Math.max(0, (this.player.body as Phaser.Physics.Arcade.Body).velocity.y));
    }

    this.player.angle = Phaser.Math.Linear(this.player.angle, direction.x * 7, Math.min(1, delta * 0.014));
    const bank = Math.min(0.12, Math.abs(direction.x) * 0.12);
    if (this.dimensional) {
      this.playerBank = easeBank(this.playerBank, direction.x * 36, delta);
      this.player.setFrame(bankFrame(this.playerBank));
    } else {
      const classicBank = direction.x <= -0.7 ? 0 : direction.x < -0.1 ? 1 : direction.x >= 0.7 ? 4 : direction.x > 0.1 ? 3 : 2;
      this.player.setTexture(ASSET_KEYS.playerBanks[classicBank]);
    }
    this.player.setScale(1 - bank, 1 + bank * 0.08);
    this.playerShadow
      .setPosition(this.player.x + 15 + direction.x * 9, this.player.y + 42)
      .setScale(1 + Math.abs(direction.x) * 0.16, 1 - Math.abs(direction.x) * 0.12)
      .setAlpha(0.5 - Math.abs(direction.x) * 0.12);
    this.contrails.clear();
    this.contrails.lineStyle(8, 0x35e8ff, 0.055).lineBetween(this.player.x - 17, this.player.y + 37, this.player.x - 18 - direction.x * 9, this.player.y + 92);
    this.contrails.lineBetween(this.player.x + 17, this.player.y + 37, this.player.x + 18 - direction.x * 9, this.player.y + 92);
    this.contrails.lineStyle(2, 0xdffcff, 0.34).lineBetween(this.player.x - 17, this.player.y + 37, this.player.x - 18 - direction.x * 9, this.player.y + 77);
    this.contrails.lineBetween(this.player.x + 17, this.player.y + 37, this.player.x + 18 - direction.x * 9, this.player.y + 77);
    if (this.keys.SPACE.isDown || this.keys.Z.isDown) this.fireWeapons(time);
  }

  private fireWeapons(time: number): void {
    const intervalScale = this.model.fireIntervalMultiplier;
    const spreadLevel = this.model.weapons.spread;
    if (time >= this.nextPrimaryAt) {
      this.primaryVolleyIndex += 1;
      const heliosVolley = this.model.modifiers.heliosBattery && this.primaryVolleyIndex % 8 === 0;
      const volley = getArcVolley(spreadLevel);
      const centerAngle = Math.min(...volley.angles.map(Math.abs));
      volley.angles.forEach((angle) => {
        const prism = this.model.modifiers.prismaticCore && Math.abs(angle) <= centerAngle + .001
          ? volley.angles.length % 2 === 0 ? 1.25 : 1.5 : 1;
        this.spawnPlayerBullet(this.player.x, this.player.y - 42, ASSET_KEYS.playerBullet, angle, volley.damage * prism * (heliosVolley ? 1.5 : 1), heliosVolley, 'spread');
      });
      if (this.model.modifiers.splitCapacitors) this.spawnPlayerBullet(this.player.x + 8, this.player.y - 40, ASSET_KEYS.playerBullet, 0, heliosVolley ? 1.5 : 1, heliosVolley, 'spread');
      this.weaponMuzzle('spread', this.player.x, this.player.y - 42, heliosVolley || this.model.weaponOverdriveState !== 'inactive');
      this.nextPrimaryAt = time + Math.max(62, volley.intervalMs * intervalScale);
      this.emitSound('arc-fire');
    }

    const droneLevel = this.model.weapons.drone;
    if (droneLevel > 0 && time >= this.nextDroneAt) {
      this.drones.filter((drone) => drone.visible).forEach((drone) => {
        this.spawnPlayerBullet(drone.x, drone.y - 20, ASSET_KEYS.wingBullet, 0, this.model.modifiers.swarmDoctrine ? 0.84 : 0.7, false, 'drone');
      });
      this.droneVolleyIndex += 1;
      if (this.model.modifiers.ordnanceCascade && this.droneVolleyIndex % 4 === 0) {
        this.drones.filter((drone) => drone.visible).forEach((drone) => {
          this.spawnPlayerBullet(drone.x, drone.y - 12, ASSET_KEYS.missile, 0, 2.2, false, 'drone');
        });
      }
      const levelRate = droneLevel >= 5 ? 0.72 : droneLevel >= 3 ? 0.82 : 1;
      this.nextDroneAt = time + 300 * intervalScale * levelRate * (this.model.modifiers.hunterLogic ? 0.8 : 1);
      this.drones.filter((drone) => drone.visible).forEach((drone) => this.weaponMuzzle('drone', drone.x, drone.y - 18, this.model.weaponOverdriveState !== 'inactive'));
      this.emitSound('wing-fire');
    }

    const missileLevel = this.model.weapons.missile;
    if (missileLevel > 0 && time >= this.nextMissileAt) {
      const volley = getNovaVolley(missileLevel);
      const count = volley.count + (this.model.modifiers.ordnanceCascade ? 1 : 0);
      for (let index = 0; index < count; index += 1) {
        const offset = (index - (count - 1) / 2) * 27;
        const hunterDamage = this.model.modifiers.hunterLogic ? 1.25 : 1;
        this.spawnPlayerBullet(this.player.x + offset, this.player.y - 18, ASSET_KEYS.missile, offset * 0.0015, volley.damage * hunterDamage, false, 'missile');
      }
      this.nextMissileAt = time + Math.max(600, volley.intervalMs * intervalScale);
      this.emitSound('nova-fire');
    }

    const laserLevel = this.model.weapons.laser;
    if (laserLevel > 0 && time >= this.nextLaserAt) {
      const centerBoost = this.model.modifiers.prismaticCore ? 1.35 : 1;
      this.spawnPlayerBullet(this.player.x, this.player.y - 53, ASSET_KEYS.laser, 0, (4 + laserLevel * 2) * centerBoost, false, 'laser');
      if (laserLevel >= 3) {
        this.spawnPlayerBullet(this.player.x - 17, this.player.y - 45, ASSET_KEYS.laser, -0.025, 5 + laserLevel, false, 'laser');
        this.spawnPlayerBullet(this.player.x + 17, this.player.y - 45, ASSET_KEYS.laser, 0.025, 5 + laserLevel, false, 'laser');
      }
      const highLevelRate = laserLevel >= 4 ? 0.8 : 1;
      this.nextLaserAt = time + Math.max(520, (1_720 - laserLevel * 190) * intervalScale * highLevelRate);
      this.weaponMuzzle('laser', this.player.x, this.player.y - 52, this.model.weaponOverdriveState !== 'inactive');
      this.emitSound('lance-fire');
    }

    if (this.model.weapons.ion > 0 && time >= this.nextIonAt) this.fireIon(time);
  }

  private fireIon(time: number): void {
    const level = this.model.weapons.ion;
    const available = this.enemies.getMatching('active', true)
      .map((enemy) => enemy as Phaser.Physics.Arcade.Sprite)
      .filter((enemy) => enemy.getData('combatReady') !== false);
    if (available.length === 0) return;
    const boss = available.find((enemy) => COMMAND_ENEMIES.includes(enemy.getData('kind') as string));
    const maxTargets = boss ? 1 : Math.min(5, level + (this.model.modifiers.prismaticCore ? 2 : 0));
    const hit: Phaser.Physics.Arcade.Sprite[] = [];
    let originX = this.player.x;
    let originY = this.player.y - 38;
    for (let index = 0; index < maxTargets; index += 1) {
      const target = available
        .filter((enemy) => !hit.includes(enemy))
        .sort((a, b) => Phaser.Math.Distance.Squared(originX, originY, a.x, a.y) - Phaser.Math.Distance.Squared(originX, originY, b.x, b.y))[0];
      if (!target || Phaser.Math.Distance.Between(originX, originY, target.x, target.y) > 430) break;
      const mount = this.firstActivePriorityZone(target);
      const impact = mount ?? target;
      this.ionArc(originX, originY, impact.x, impact.y);
      hit.push(target);
      originX = impact.x;
      originY = impact.y;
    }
    if (hit.length === 0) return;
    this.model.registerShot();
    const damage = (2.4 + level * 0.8) * (level >= 4 ? 1.25 : 1) * this.model.damageMultiplier;
    hit.forEach((enemy) => {
      this.model.registerHit();
      const weakpoint = this.firstActivePriorityZone(enemy);
      this.damageEnemy(
        enemy,
        damage,
        weakpoint ? 'weakpoint' : 'core',
        weakpoint ? weakpoint.getData('zoneIndex') as number : -1,
        this.model.weaponOverdriveState !== 'inactive',
      );
    });
    if (level >= 5 && !boss) {
      const final = hit[hit.length - 1];
      this.applyIonDischarge(final.x, final.y, final.getData('entityId') as number, damage * 0.45);
      if (this.model.modifiers.gravityPayload) this.pullRegularEnemies(final.x, final.y, 120);
    }
    this.nextIonAt = time + Math.max(720, 1_650 - level * 150) * this.model.fireIntervalMultiplier;
    this.emitSound('ion-fire');
    this.emitSound('ion-impact', hit[0].x);
  }

  private ionArc(x1: number, y1: number, x2: number, y2: number): void {
    const arc = this.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    const points = [new Phaser.Math.Vector2(x1, y1)];
    for (let step = 1; step < 6; step += 1) {
      const t = step / 6;
      points.push(new Phaser.Math.Vector2(
        Phaser.Math.Linear(x1, x2, t) + Phaser.Math.Between(-8, 8),
        Phaser.Math.Linear(y1, y2, t) + Phaser.Math.Between(-8, 8),
      ));
    }
    points.push(new Phaser.Math.Vector2(x2, y2));
    const overdrive = this.model.weaponOverdriveState !== 'inactive';
    arc.lineStyle(7, overdrive ? OVERDRIVE_GOLD : 0x8b7dff, overdrive ? 0.34 : 0.2).strokePoints(points);
    arc.lineStyle(2, overdrive ? OVERDRIVE_CORE : 0xf3efff, 0.96).strokePoints(points);
    this.transientViews.add(arc);
    this.tweens.add({ targets: arc, alpha: 0, duration: 150, onComplete: () => this.destroyTransient(arc) });
  }

  private applyIonDischarge(x: number, y: number, excludedId: number, damage: number): void {
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (enemy.active && enemy.getData('entityId') !== excludedId && Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= 42) {
        this.damageEnemy(enemy, damage);
      }
      return true;
    });
    const overdrive = this.model.weaponOverdriveState !== 'inactive';
    const pulse = this.add.circle(x, y, 8, overdrive ? OVERDRIVE_GOLD : 0xb79cff, 0.16)
      .setDepth(6)
      .setStrokeStyle(2, overdrive ? OVERDRIVE_CORE : 0xf3efff, 0.9);
    this.transientViews.add(pulse);
    this.tweens.add({ targets: pulse, scale: 5.2, alpha: 0, duration: 220, onComplete: () => this.destroyTransient(pulse) });
  }

  private weaponMuzzle(kind: 'spread' | 'laser' | 'drone', x: number, y: number, overdrive: boolean): void {
    const color = overdrive ? OVERDRIVE_GOLD : kind === 'spread' ? 0x35e8ff : kind === 'laser' ? 0xf06cff : 0x65ffb1;
    const flash = kind === 'laser'
      ? this.add.rectangle(x, y, 12, 32, color, 0.34).setStrokeStyle(2, overdrive ? OVERDRIVE_CORE : 0xffffff, 0.82)
      : this.add.circle(x, y, kind === 'spread' ? 8 : 6, color, 0.22).setStrokeStyle(2, overdrive ? OVERDRIVE_CORE : color, 0.88);
    flash.setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.transientViews.add(flash);
    this.tweens.add({ targets: flash, scale: kind === 'laser' ? 1.8 : 2.4, alpha: 0, duration: kind === 'laser' ? 100 : 80, onComplete: () => this.destroyTransient(flash) });
  }

  private spawnPlayerBullet(
    x: number,
    y: number,
    texture: string,
    angle: number,
    baseDamage: number,
    forceOverdriveVisual = false,
    weaponKind: WeaponType = 'spread',
  ): void {
    const overdriveState = this.model.weaponOverdriveState;
    const overdriveVisual = overdriveState !== 'inactive' || forceOverdriveVisual;
    const renderTexture = !overdriveVisual
      ? texture
      : texture === ASSET_KEYS.missile
        ? ASSET_KEYS.missileOverdrive
        : texture === ASSET_KEYS.laser
          ? ASSET_KEYS.laserOverdrive
          : texture === ASSET_KEYS.wingBullet
            ? ASSET_KEYS.wingBulletOverdrive
          : ASSET_KEYS.playerBulletOverdrive;
    const bullet = this.playerBullets.get(x, y, renderTexture) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;
    bullet.clearTint().setTexture(renderTexture).setPosition(x, y).setActive(true).setVisible(true).setDepth(4).setAlpha(1).setScale(1);
    if (overdriveVisual) {
      this.particles.setParticleTint(OVERDRIVE_GOLD);
      this.particles.explode(2, x, y);
    }
    if (texture === ASSET_KEYS.laser && this.model.modifiers.splitCapacitors) bullet.setScale(1.2, 1);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    const isLaser = texture === ASSET_KEYS.laser;
    const isWing = texture === ASSET_KEYS.wingBullet;
    const isArc = texture === ASSET_KEYS.playerBullet;
    body.setSize(isLaser && this.model.modifiers.splitCapacitors ? 11 : isWing ? 7 : 8, isLaser ? 48 : isWing ? 16 : isArc ? 24 : 18);
    const missile = texture === ASSET_KEYS.missile;
    bullet.setDataEnabled()
      .setData('damage', baseDamage * (weaponKind === 'spread' ? this.model.arcDamageMultiplier : this.model.damageMultiplier))
      .setData('missile', missile)
      .setData('weaponKind', weaponKind)
      .setData('overdriveVisual', overdriveVisual)
      .setData('nextVisualTrailAt', 0)
      .setData('nextTrailAt', 0)
      .setData('pierce', this.model.modifiers.phaseArsenal ? 1 : 0)
      .setData('hitTargets', new Set<number>());
    const speed = missile ? 620 : 940;
    bullet.setVelocity(Math.sin(angle) * speed, -Math.cos(angle) * speed);
    bullet.setRotation(angle);
    this.model.registerShot();
  }

  private updateProjectiles(delta: number): void {
    this.playerBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) return true;
      if (bullet.getData('missile')) this.homeMissile(bullet, delta);
      if (bullet.getData('weaponKind') === 'laser' && this.combatNow >= ((bullet.getData('nextVisualTrailAt') as number | undefined) ?? 0)) {
        bullet.setData('nextVisualTrailAt', this.combatNow + 80);
        const afterimage = this.add.image(bullet.x, bullet.y + 18, bullet.texture.key)
          .setDepth(3)
          .setAlpha(0.18)
          .setScale(bullet.scaleX, bullet.scaleY)
          .setRotation(bullet.rotation)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.transientViews.add(afterimage);
        this.tweens.add({ targets: afterimage, alpha: 0, scaleY: bullet.scaleY * 0.72, duration: 90, onComplete: () => this.destroyTransient(afterimage) });
      }
      if (bullet.getData('overdriveVisual') && this.combatNow >= ((bullet.getData('nextTrailAt') as number | undefined) ?? 0)) {
        bullet.setData('nextTrailAt', this.combatNow + 70);
        this.particles.setParticleTint(OVERDRIVE_GOLD);
        this.particles.explode(1, bullet.x, bullet.y + 8);
      }
      if (bullet.y < -80 || bullet.x < -80 || bullet.x > WORLD_WIDTH + 80) this.disableBody(bullet);
      return true;
    });
    this.enemyBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) return true;
      const body = bullet.body as Phaser.Physics.Arcade.Body;
      const previousScale = (bullet.getData('chronoScale') as number | undefined) ?? 1;
      const nextScale = this.model.chronoScale;
      if (previousScale !== nextScale) body.velocity.scale(nextScale / previousScale);
      bullet.setData('chronoScale', nextScale);
      if (bullet.y > WORLD_HEIGHT + 50 || bullet.y < -50 || bullet.x < -50 || bullet.x > WORLD_WIDTH + 50) this.disableBody(bullet);
      return true;
    });
  }

  private homeMissile(missile: Phaser.Physics.Arcade.Sprite, delta: number): void {
    let nearest: Phaser.Math.Vector2 | undefined;
    let distance = Number.POSITIVE_INFINITY;
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active || enemy.getData('combatReady') === false) return true;
      const weakpoints = ((enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined) ?? [])
        .filter((zone) => zone.active && zone.getData('role') === 'weakpoint');
      const targets = weakpoints.length > 0 ? weakpoints : [enemy];
      for (const target of targets) {
        const specialist = !['scout', 'interceptor'].includes(enemy.getData('kind') as string);
        const preference = weakpoints.length > 0 ? 0.55 : this.model.modifiers.swarmDoctrine && specialist ? 0.68 : 1;
        const candidate = Phaser.Math.Distance.Squared(missile.x, missile.y, target.x, target.y) * preference;
        if (candidate < distance) {
          distance = candidate;
          nearest = new Phaser.Math.Vector2(target.x, target.y);
        }
      }
      return true;
    });
    if (!nearest) return;
    const desired = Phaser.Math.Angle.Between(missile.x, missile.y, nearest.x, nearest.y);
    const body = missile.body as Phaser.Physics.Arcade.Body;
    const current = Math.atan2(body.velocity.y, body.velocity.x);
    const hunterScale = this.model.modifiers.hunterLogic ? 1.25 : 1;
    const next = Phaser.Math.Angle.RotateTo(current, desired, delta * 0.004 * hunterScale);
    this.physics.velocityFromRotation(next, 620, body.velocity);
    missile.rotation = next + Math.PI / 2;
  }

  private firstActivePriorityZone(enemy: Phaser.Physics.Arcade.Sprite): Phaser.GameObjects.Zone | undefined {
    if (!['bulwark', 'nullArchitect'].includes(enemy.getData('kind') as string)) return undefined;
    return ((enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined) ?? [])
      .find((zone) => zone.active && zone.getData('role') === 'weakpoint');
  }

  private updateDrones(delta: number): void {
    const level = this.model.weapons.drone;
    const formation = droneFormation(level, this.model.sortieModule === 'wingman-beacon');
    this.drones.forEach((drone, index) => {
      const slot = formation[index];
      const visible = Boolean(slot);
      drone.setVisible(visible);
      if (!visible) return;
      const overdrive = this.model.weaponOverdriveState !== 'inactive';
      const mk2 = slot.variant === 'mk2';
      const texture = overdrive
        ? mk2 ? ASSET_KEYS.droneMk2Overdrive : ASSET_KEYS.droneOverdrive
        : mk2 ? ASSET_KEYS.droneMk2 : ASSET_KEYS.drone;
      drone.clearTint().setTexture(this.dimensional ? shipKey(mk2 ? 'droneMk2' : 'drone') : texture,
        this.dimensional ? bankFrame(this.playerBank * .7) : undefined);
      if (this.dimensional && overdrive) drone.setTint(OVERDRIVE_GOLD);
      if (slot.variant === 'beacon' && !overdrive) drone.setTint(0x9d8cff);
      const targetX = this.player.x + slot.x;
      const targetY = this.player.y + slot.y + Math.sin(this.combatNow * 0.004 + index * Math.PI) * 5;
      drone.x = Phaser.Math.Linear(drone.x, targetX, Math.min(1, delta * 0.012));
      drone.y = Phaser.Math.Linear(drone.y, targetY, Math.min(1, delta * 0.012));
    });
  }

  private updateWaveDirector(time: number): void {
    if (this.model.mode !== 'playing' || this.isolatedCraftPreview) return;
    if (isFinaleMission(this.model.mission.id)) {
      this.updateDreadnoughtApproach();
      return;
    }

    const progress = Math.min(1, this.model.stageElapsedMs / this.model.stageDurationMs);
    this.maybeSecureProgressWaypoint(progress);
    const threat = this.model.snapshot().threatLevel;
    if (threat !== this.lastThreatLevel) {
      this.lastThreatLevel = threat;
      this.announce(`THREAT LEVEL ${threat} // PRESSURE RISING`);
      this.emitSound('warning');
    }
    if (this.maybeSpawnMiniboss(progress)) return;
    if (this.maybeIntroduceBulwark(progress)) return;
    this.maybeSpawnArmamentCarrier(progress);
    this.maybeSpawnCommandTargets();
    if (this.model.stageElapsedMs >= this.model.stageDurationMs && this.commandSpawned && this.commandRemaining <= 0) {
      // A late command kill can create an Armament pair after the mission clock
      // expires. Preserve its full choice window before extraction clears pickups.
      if (!this.hasActiveArmamentPair()) this.completeMission(false);
      return;
    }
    if (this.commandEncounterActive || time < this.nextWaveAt || this.enemies.countActive(true) >= MAX_ACTIVE_ENEMIES - 4) return;
    this.spawnWave(this.waveIndex);
    this.waveIndex += 1;
    const tuning = this.encounterDirector?.tuning(progress) ?? getThreatTuning(progress, this.model.difficulty, this.model.mission.id);
    this.spawnThreatEscorts(tuning.waveBudget);
    this.nextWaveAt = time + tuning.waveIntervalMs;
  }

  private updateDreadnoughtApproach(): void {
    if (this.bossSpawned || this.bossSpawnScheduled) return;
    const lastLight = this.model.mission.id === 'lastLight';
    const approachDuration = this.model.mission.approachDurationMs ?? 30_000;
    const thresholds = lastLight ? [1_100, 9_000, 18_000, 27_000] : [1_100, 8_000, 15_000, 22_000];
    if (this.finaleApproachWave < thresholds.length && this.model.stageElapsedMs >= thresholds[this.finaleApproachWave]) {
      const wave = this.finaleApproachWave;
      this.finaleApproachWave += 1;
      if (lastLight) {
        if (wave === 0 || wave === 2) {
          this.spawnEnemy('skimmer', wave === 0 ? 280 : 1000, -90, wave);
          this.spawnEnemy('scout', 640, -120, wave + 1);
          if (wave === 2) this.spawnEnemy('skimmer', 380, -180, wave + 2);
        } else {
          this.spawnEnemy('weaver', wave === 1 ? 820 : 470, -100, wave);
          this.spawnEnemy('bomber', wave === 1 ? 350 : 930, -170, wave + 1);
        }
        if (wave === 3) this.announce('RELAY GUARD // CLEAR THE APPROACH');
      } else if (wave === 0) {
        for (let index = -2; index <= 2; index += 1) this.spawnEnemy('scout', WORLD_WIDTH / 2 + index * 105, -70 - Math.abs(index) * 34, index);
      } else if (wave === 1) {
        for (let index = 0; index < 4; index += 1) this.spawnEnemy('interceptor', index % 2 === 0 ? -30 : WORLD_WIDTH + 30, 85 + index * 96, index);
      } else if (wave === 2) {
        this.spawnEnemy('bomber', WORLD_WIDTH / 2, -80, 0);
        this.spawnEnemy('scout', 330, -150, 1);
        this.spawnEnemy('scout', 950, -150, 2);
      } else {
        this.spawnEnemy('elite', WORLD_WIDTH / 2, -85, 0);
        this.spawnEnemy('bomber', 360, -155, 1);
        this.spawnEnemy('bomber', 920, -155, 2);
        this.announce('DREADNOUGHT ESCORT // FINAL SCREEN');
      }
    }
    if (this.model.stageElapsedMs < approachDuration) return;
    if (this.enemies.countActive(true) > 0) {
      if (this.model.stageElapsedMs < approachDuration + 250) this.announce('CLEAR THE FINAL ESCORT');
      return;
    }
    if (this.hasActiveArmamentPair()) return;
    this.model.setFinalePhase('boss');
    this.announce(lastLight ? 'SERAPH // THE RELAY GUARDIAN' : 'FORTRESS CORE AHEAD');
    this.enemyBullets.clear(true, true);
    this.mines.clear(true, true);
    if (!this.model.latestWaypointId) this.secureWaypoint(1);
    this.scheduleBoss(650);
  }

  private scheduleBoss(delay: number, initialHealthRatio = 1): void {
    const run = this.missionRun;
    this.bossSpawnScheduled = true;
    const spawnWhenPlaying = (): void => {
      if (run !== this.missionRun) return;
      if (this.model.mode === 'paused') {
        this.time.delayedCall(150, spawnWhenPlaying);
        return;
      }
      this.bossSpawnScheduled = false;
      this.spawnBoss(initialHealthRatio);
    };
    this.time.delayedCall(delay, spawnWhenPlaying);
  }

  private maybeSecureProgressWaypoint(progress: number): void {
    const nextId = ((this.model.latestWaypointId ?? 0) + 1) as MissionWaypointId;
    if (nextId > 2) return;
    const threshold = nextId === 1 ? 0.33 : 0.66;
    if (progress < threshold && this.pendingWaypointId !== nextId) return;
    if (this.commandEncounterActive || this.commandRemaining > 0 || this.hasActiveArmamentPair()) {
      this.pendingWaypointId = nextId;
      return;
    }
    this.pendingWaypointId = undefined;
    this.secureWaypoint(nextId);
  }

  private hasActiveArmamentPair(): boolean {
    return this.pickups.getMatching('active', true)
      .some((pickup) => (pickup as Phaser.Physics.Arcade.Sprite).getData('pairId') !== undefined);
  }

  private encounterCheckpoint(): EncounterCheckpointSnapshot {
    return {
      waveIndex: this.waveIndex,
      nextCarrierIndex: this.nextCarrierIndex,
      killsSinceUtilityDrop: this.killsSinceUtilityDrop,
      armamentOfferHistory: this.armamentOfferHistory.map((pair) => [pair[0], pair[1]] as const),
      minibossSpawned: this.minibossSpawned,
      commandSpawned: this.commandSpawned,
      commandRemaining: this.commandRemaining,
      bulwarkIntroduced: this.bulwarkIntroduced,
      finaleApproachWave: this.finaleApproachWave,
      bossSpawned: this.bossSpawned,
      lastThreatLevel: this.lastThreatLevel as 1 | 2 | 3 | 4 | 5,
      lastUtility: this.lastUtility,
    };
  }

  private secureWaypoint(id: MissionWaypointId): void {
    if (this.model.mode !== 'playing' || this.isolatedCraftPreview) return;
    if (this.commandEncounterActive || this.commandRemaining > 0) return;
    if ((this.model.latestWaypointId ?? 0) >= id) return;
    this.model.setLatestWaypoint(id);
    const healthRatio = this.boss?.active
      ? (this.boss.getData('health') as number) / Math.max(1, this.boss.getData('maxHealth') as number)
      : undefined;
    const waypoint: MissionWaypointSnapshot = {
      missionId: this.model.mission.id,
      waypointId: id,
      capturedAtMs: this.model.stageElapsedMs,
      game: this.model.exportCheckpoint(),
      encounter: this.encounterCheckpoint(),
      bossHealthRatio: healthRatio,
    };
    event('aegis:waypoint-secured', waypoint);
    this.announce(`WAYPOINT SECURED // ${id} OF 2`);
    this.emitSound('pickup');
    this.emitState(true);
  }

  private restoreEncounterCheckpoint(waypoint: MissionWaypointSnapshot): void {
    const checkpoint = restoreEncounterCursor(waypoint.encounter);
    this.waveIndex = Math.max(0, checkpoint.waveIndex);
    this.nextCarrierIndex = Math.max(0, checkpoint.nextCarrierIndex);
    this.killsSinceUtilityDrop = Math.max(0, checkpoint.killsSinceUtilityDrop);
    this.armamentOfferHistory = checkpoint.armamentOfferHistory;
    this.minibossSpawned = checkpoint.minibossSpawned;
    this.commandSpawned = checkpoint.commandSpawned;
    this.commandRemaining = Math.max(0, checkpoint.commandRemaining);
    this.commandEncounterActive = false;
    this.bulwarkIntroduced = checkpoint.bulwarkIntroduced;
    this.finaleApproachWave = Math.max(0, checkpoint.finaleApproachWave);
    this.lastThreatLevel = checkpoint.lastThreatLevel;
    this.lastUtility = checkpoint.lastUtility;
  }

  private maybeSpawnMiniboss(progress: number): boolean {
    const definition = minibossForMission(this.model.mission.id);
    if (!definition || this.minibossSpawned || progress < definition.progress) return false;
    if (this.commandEncounterActive) return true;
    if (this.enemies.countActive(true) > 0 || this.hasActiveArmamentPair()) {
      this.nextWaveAt = Math.max(this.nextWaveAt, this.combatNow + 900);
      return true;
    }
    const enemy = this.spawnEnemy(definition.kind, WORLD_WIDTH / 2, -120, 0);
    if (!enemy) return true;
    this.minibossSpawned = true;
    this.commandEncounterActive = true;
    enemy.setData('midboss', true).setData('attackIndex', 0);
    if (definition.kind === 'pursuer') enemy.setData('routeVariant', this.model.mission.id);
    this.model.setBoss(definition.name, 1);
    this.announce(`WARNING // ${definition.name}`);
    this.emitSound('warning');
    return true;
  }

  private maybeIntroduceBulwark(progress: number): boolean {
    if (this.model.mission.id !== 'minefield' || this.bulwarkIntroduced || progress < 0.55 || this.commandEncounterActive) return false;
    if (this.enemies.countActive(true) > 0) {
      this.nextWaveAt = Math.max(this.nextWaveAt, this.combatNow + 900);
      return true;
    }
    const bulwark = this.spawnEnemy('bulwark', WORLD_WIDTH / 2, -100, 0);
    if (!bulwark) return true;
    this.bulwarkIntroduced = true;
    this.nextWaveAt = this.combatNow + 5_400;
    this.announce('NEW CONTACT // BULWARK GUNSHIP');
    this.emitSound('warning');
    return true;
  }

  private maybeSpawnArmamentCarrier(progress: number): void {
    const milestones = carrierMilestones(this.model.mission.id);
    if (this.nextCarrierIndex >= milestones.length || progress < milestones[this.nextCarrierIndex]) return;
    if (this.enemies.countActive(true) >= MAX_ACTIVE_ENEMIES - 2 || this.commandEncounterActive) return;
    const localIndex = this.nextCarrierIndex;
    this.nextCarrierIndex += 1;
    const x = this.encounterDirector?.between(localIndex, 92, 300, 980) ?? Phaser.Math.Between(300, 980);
    const carrier = this.spawnEnemy(carrierKind(this.model.mission.id, localIndex), x, -100, localIndex);
    if (!carrier) {
      this.nextCarrierIndex -= 1;
      return;
    }
    const firstCoastalCarrier = this.model.mission.id === 'coastal' && localIndex === 0;
    this.markCarrier(carrier, globalCarrierIndex(this.model.mission.id, localIndex), !firstCoastalCarrier);
    if (firstCoastalCarrier) {
      // The first upgrade is a replacement encounter, not an extra wave. Consume
      // the upcoming cursor only after a successful spawn, so retry/save cursors
      // and deterministic future formations remain in sync.
      this.waveIndex += 1;
      const tuning = getThreatTuning(progress, this.model.difficulty, this.model.mission.id);
      this.nextWaveAt = Math.max(this.combatNow, this.nextWaveAt) + tuning.waveIntervalMs;
    }
    this.announce('ARMAMENT CORE DETECTED');
    this.emitSound('warning');
  }

  private maybeSpawnCommandTargets(): void {
    if (this.commandSpawned) return;
    const remaining = this.model.stageDurationMs - this.model.stageElapsedMs;
    if (this.model.mission.id === 'coastal' && remaining <= 18_000) {
      const leader = this.spawnEnemy('elite', WORLD_WIDTH / 2, -80, 0);
      if (!leader) return;
      this.commandSpawned = true;
      this.commandRemaining = 1;
      this.announce('COMMAND FORMATION INBOUND');
      leader.setData('commandTarget', true);
      this.configureDepthArrival(leader, 1_200);
      this.spawnEnemy('interceptor', 220, -45, 1);
      this.spawnEnemy('interceptor', WORLD_WIDTH - 220, -45, 2);
    } else if (this.model.mission.id === 'minefield' && this.model.stageElapsedMs >= this.model.stageDurationMs * 0.785) {
      this.enemies.clear(true, true);
      this.enemyHitZones.clear(true, true);
      this.enemyBullets.clear(true, true);
      this.cleanupDetachedViews();
      const warden = this.spawnEnemy('warden', WORLD_WIDTH / 2, -105, 0);
      if (!warden) return;
      this.commandSpawned = true;
      this.commandRemaining = 1;
      this.commandEncounterActive = true;
      this.announce('WARNING // WARDEN DETECTED');
      this.emitSound('warning');
      warden.setData('commandTarget', true).setData('attackIndex', 0);
      this.markCarrier(warden, globalCarrierIndex('minefield', 3), false);
      this.model.setBoss('WARDEN', 1);
    } else if (this.model.mission.id === 'aurora' && remaining <= 20_000) {
      const sentinel = this.spawnEnemy('elite', WORLD_WIDTH / 2, -90, 0);
      if (!sentinel) return;
      this.commandSpawned = true;
      this.commandRemaining = 1;
      this.announce('AURORA SENTINEL // CLEAR THE CONVOY CORRIDOR');
      this.emitSound('warning');
      sentinel.setData('commandTarget', true);
      this.markCarrier(sentinel, globalCarrierIndex('aurora', 3), false);
      this.configureDepthArrival(sentinel, 1_200);
      this.spawnEnemy('prism', 330, -140, 1);
      this.spawnEnemy('leech', 950, -180, 2);
    } else if (this.model.mission.id === 'fortress' && remaining <= 25_000) {
      // Both leaders are required; wait for two slots before starting the formation.
      if (this.enemies.countActive(true) > MAX_ACTIVE_ENEMIES - 2) return;
      const left = this.spawnEnemy('elite', 390, -80, 1);
      const right = this.spawnEnemy('elite', 890, -130, 2);
      this.commandRemaining = Number(Boolean(left)) + Number(Boolean(right));
      if (this.commandRemaining === 0) return;
      this.commandSpawned = true;
      this.announce('COMMAND-ELITE GAUNTLET');
      left?.setData('commandTarget', true);
      if (left) {
        this.markCarrier(left, globalCarrierIndex('fortress', 4), false);
        this.configureDepthArrival(left, 1_200);
      }
      right?.setData('commandTarget', true);
      if (right) this.configureDepthArrival(right, 1_200);
      this.spawnEnemy('shieldCarrier', WORLD_WIDTH / 2, -180, 0);
    } else if ((this.model.mission.id === 'stormbreak' || this.model.mission.id === 'graveyard') && remaining <= 20_000) {
      const command = this.spawnEnemy('elite', WORLD_WIDTH / 2, -90, 0);
      if (!command) return;
      this.commandSpawned = true;
      this.commandRemaining = 1;
      this.announce(this.model.mission.id === 'stormbreak' ? 'STORM ACE INBOUND' : 'SALVAGE COMMAND SHIP INBOUND');
      command.setData('commandTarget', true);
      this.configureDepthArrival(command, 1_200);
      if (this.model.mission.id === 'stormbreak') {
        this.spawnEnemy('phantom', 300, -140, 1);
        this.spawnEnemy('phantom', 980, -140, 2);
      } else this.spawnEnemy('reclaimer', WORLD_WIDTH / 2 + 230, -150, 1);
    } else if (this.model.mission.id === 'carrierSiege' && remaining <= 30_000) {
      const carrier = this.spawnEnemy('carrierBoss', WORLD_WIDTH / 2, -110, 0);
      if (!carrier) return;
      this.commandSpawned = true;
      this.commandRemaining = 1;
      this.commandEncounterActive = true;
      this.enemyBullets.clear(true, true);
      this.announce('WARNING // BASTION CARRIER');
      this.emitSound('warning');
      carrier.setData('commandTarget', true).setData('attackIndex', 0);
      this.model.setBoss('BASTION CARRIER', 1);
    }
  }

  private spawnWave(index: number): void {
    const pattern = index % 6;
    const progress = this.model.stageElapsedMs / this.model.stageDurationMs;
    if (this.model.mission.id === 'aurora') {
      const director = this.encounterDirector ?? new EncounterDirector(this.model.campaignSeed, this.model.difficulty, 'aurora');
      for (const spawn of auroraWave(director, index, progress)) this.spawnEnemy(spawn.kind, spawn.x, spawn.y, spawn.phase);
      return;
    }
    const gentleOpening = isCoastalOpening(this.model.mission.id, progress);
    if (pattern === 0) {
      const center = this.waveX(index, 0, 300, 980);
      const flankCount = gentleOpening ? 1 : 2;
      for (let i = -flankCount; i <= flankCount; i += 1) this.spawnEnemy('scout', center + i * 78, -40 - Math.abs(i) * 34, i);
      return;
    }
    if (pattern === 1) {
      for (let i = 0; i < (gentleOpening ? 2 : 4); i += 1) this.spawnEnemy('interceptor', i % 2 === 0 ? -30 : WORLD_WIDTH + 30, 65 + i * 78, i);
      return;
    }
    if (['fortress', 'stormbreak', 'graveyard', 'carrierSiege'].includes(this.model.mission.id) && pattern === 5 && progress > .2) {
      const kind = index % 12 === 5 ? 'skimmer' : 'weaver';
      this.spawnEnemy(kind, this.waveX(index, 71, 300, 980), -90, index);
      this.spawnEnemy('scout', 260, -145, index + 1);
      this.spawnEnemy('scout', 1020, -185, index + 2);
      return;
    }
    if (this.model.mission.id === 'coastal') {
      if (pattern === 2 && progress > 0.1) {
        this.spawnEnemy('charger', this.waveX(index, 1, 240, 1040), -70, index);
        this.spawnEnemy('scout', 330, -120, 0);
        this.spawnEnemy('scout', 950, -120, 1);
      } else if (pattern === 4 && progress > 0.25) {
        this.spawnEnemy('sniper', this.waveX(index, 2, 250, 1030), -70, index);
        this.spawnEnemy('bomber', this.waveX(index, 3, 300, 980), -150, index);
      } else this.spawnBaseHeavyWave(index, progress);
      return;
    }
    if (this.model.mission.id === 'minefield') {
      if (progress > 0.7 && pattern === 4 && this.countActiveEnemies('bulwark') === 0) {
        this.spawnEnemy('bulwark', WORLD_WIDTH / 2, -90, index);
        this.spawnEnemy('scout', 350, -145, 1);
        this.spawnEnemy('scout', 930, -145, 2);
      } else if (pattern === 2 || pattern === 5) {
        this.spawnEnemy('mineLayer', this.waveX(index, 4, 260, 1020), -80, index);
        for (let i = 0; i < 3; i += 1) this.spawnEnemy('scout', 260 + i * 380, -130 - i * 30, i);
      } else if (pattern === 4) {
        this.spawnEnemy('shieldCarrier', WORLD_WIDTH / 2, -85, index);
        this.spawnEnemy('bomber', 400, -145, 1);
        this.spawnEnemy('bomber', 880, -145, 2);
      } else this.spawnBaseHeavyWave(index, progress);
      return;
    }

    if (this.model.mission.id === 'stormbreak') {
      if (pattern === 2 && progress > 0.12) {
        this.spawnEnemy('phantom', this.waveX(index, 31, 220, 1060), -80, index);
      } else if (pattern === 4 && progress > 0.34 && this.countActiveEnemies('artillery') === 0) {
        this.spawnEnemy('artillery', this.waveX(index, 32, 280, 1000), -90, index);
        if (progress > 0.68) this.spawnEnemy('phantom', this.waveX(index, 33, 220, 1060), -155, index + 1);
      } else if (pattern === 5 && progress > 0.7) {
        this.spawnEnemy('sniper', 320, -100, index);
        this.spawnEnemy('phantom', 950, -145, index + 1);
      } else this.spawnBaseHeavyWave(index, progress);
      return;
    }

    if (this.model.mission.id === 'graveyard') {
      if (pattern === 2 && progress > 0.12 && this.countActiveEnemies('reclaimer') === 0) {
        this.spawnEnemy('reclaimer', this.waveX(index, 41, 250, 1030), -80, index);
      } else if (pattern === 4 && progress > 0.4) {
        this.spawnEnemy('mineLayer', this.waveX(index, 42, 270, 1010), -90, index);
        if (this.countActiveEnemies('reclaimer') === 0) this.spawnEnemy('reclaimer', this.waveX(index, 43, 260, 1020), -150, index + 1);
      } else if (pattern === 5 && progress > 0.68 && this.countActiveEnemies('bulwark') === 0) {
        this.spawnEnemy('bulwark', WORLD_WIDTH / 2, -90, index);
        this.spawnEnemy('scout', 300, -145, 1);
        this.spawnEnemy('scout', 980, -145, 2);
      } else this.spawnBaseHeavyWave(index, progress);
      return;
    }

    if (this.model.mission.id === 'carrierSiege') {
      if (pattern === 2) {
        this.spawnEnemy('phantom', this.waveX(index, 51, 220, 1060), -80, index);
        if (progress > 0.45 && this.countActiveEnemies('reclaimer') === 0) this.spawnEnemy('reclaimer', 300, -150, index + 1);
      } else if (pattern === 4 && this.countActiveEnemies('artillery') === 0) {
        this.spawnEnemy('artillery', this.waveX(index, 52, 280, 1000), -90, index);
        if (this.model.difficulty === 'ace' || progress > 0.72) this.spawnEnemy('phantom', 940, -160, index + 1);
      } else if (pattern === 5 && progress > 0.58) {
        this.spawnEnemy('shieldCarrier', WORLD_WIDTH / 2, -100, 0);
        this.spawnEnemy('bomber', 330, -160, 1);
        this.spawnEnemy('phantom', 950, -160, 2);
      } else this.spawnBaseHeavyWave(index, progress);
      return;
    }

    const specialist = SPECIALISTS[(index + Math.floor(progress * 4)) % SPECIALISTS.length];
    if (pattern === 2 && progress > 0.35 && this.countActiveEnemies('bulwark') === 0) {
      this.spawnEnemy('bulwark', this.waveX(index, 5, 360, 920), -90, index);
      this.spawnEnemy('interceptor', -30, 120, 1);
      this.spawnEnemy('interceptor', WORLD_WIDTH + 30, 210, 2);
    } else if (pattern === 4 && progress > 0.58 && this.countActiveEnemies('bulwark') === 0) {
      this.spawnEnemy('bulwark', this.waveX(index, 5, 360, 920), -90, index);
      this.spawnEnemy('sniper', this.waveX(index, 9, 250, 1030), -150, index + 1);
    } else if (pattern === 2 || pattern === 4) {
      this.spawnEnemy(specialist, this.waveX(index, 5, 260, 1020), -80, index);
      this.spawnEnemy(pattern === 2 ? 'bomber' : 'elite', this.waveX(index, 6, 300, 980), -160, index + 1);
    } else if (pattern === 5) {
      this.spawnEnemy('shieldCarrier', WORLD_WIDTH / 2, -90, 0);
      this.spawnEnemy('charger', 330, -150, 1);
      this.spawnEnemy('sniper', 950, -150, 2);
    } else this.spawnBaseHeavyWave(index, progress);
  }

  private spawnThreatEscorts(waveBudget: number): void {
    const bonusCount = Math.min(3, Math.max(0, Math.floor((waveBudget - 4) / 3)));
    for (let bonus = 0; bonus < bonusCount; bonus += 1) {
      if (this.enemies.countActive(true) >= MAX_ACTIVE_ENEMIES - 1) return;
      const x = this.encounterDirector?.between(this.waveIndex, bonus + 200, 170, WORLD_WIDTH - 170) ?? Phaser.Math.Between(170, WORLD_WIDTH - 170);
      const kind: EnemyKind = waveBudget >= 10 && bonus === bonusCount - 1 ? 'interceptor' : 'scout';
      this.spawnEnemy(kind, x, -110 - bonus * 45, this.waveIndex + bonus);
    }
  }

  private waveX(waveIndex: number, salt: number, min: number, max: number): number {
    return this.encounterDirector?.between(waveIndex, salt, min, max) ?? Phaser.Math.Between(min, max);
  }

  private spawnBaseHeavyWave(index: number, progress: number): void {
    const gentleOpening = isCoastalOpening(this.model.mission.id, progress);
    // Early pattern slots 2–5 formerly all fell back to a Bomber. Alternate
    // light passes, and never stack another regular Bomber while one survives.
    if (gentleOpening && (index % 2 === 1 || this.countActiveEnemies('bomber') > 0)) {
      const center = this.waveX(index, 73, 340, 940);
      this.spawnEnemy('scout', center - 90, -60, index);
      this.spawnEnemy('scout', center + 90, -110, index + 1);
      return;
    }
    if (index % 3 === 0 && progress > 0.25) {
      this.spawnEnemy('elite', this.waveX(index, 7, 320, 960), -70, index);
      this.announce('ELITE SIGNAL DETECTED');
    } else {
      this.spawnEnemy('bomber', this.waveX(index, 8, 250, 1030), -60, index);
      const escorts = gentleOpening ? 1 : 3;
      for (let i = 0; i < escorts; i += 1) this.spawnEnemy('scout', escorts === 1 ? 640 : 270 + i * 370, -130 - i * 28, i);
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, phase: number): Phaser.Physics.Arcade.Sprite | undefined {
    if (this.enemies.countActive(true) >= MAX_ACTIVE_ENEMIES) return undefined;
    if (kind === 'bulwark' && this.countActiveEnemies('bulwark') >= 1) return undefined;
    if ((kind === 'artillery' || kind === 'reclaimer' || kind === 'carrierBoss' || kind === 'razorwing' || kind === 'gatekeeper' || kind === 'pursuer') && this.countActiveEnemies(kind) >= 1) return undefined;
    if ((kind === 'phantom' || kind === 'skimmer' || kind === 'prism') && this.countActiveEnemies(kind) >= 2) return undefined;
    if ((kind === 'weaver' || kind === 'leech' || EXPANSION_BOSSES.includes(kind)) && this.countActiveEnemies(kind) >= 1) return undefined;
    const key = this.shipTexture(kind);
    const enemy = this.physics.add.sprite(x, y, key, this.dimensional ? NEUTRAL_BANK : undefined).setDepth(3);
    this.enemies.add(enemy);
    const config = ENEMIES[kind];
    const progress = Math.min(1, this.model.stageElapsedMs / Math.max(1, this.model.stageDurationMs));
    const threat = getThreatTuning(progress, this.model.difficulty, this.model.mission.id);
    const healthProgress = encounterHealthProgress(kind, this.model.stageElapsedMs, this.model.stageDurationMs, this.model.mission.approachDurationMs ?? 35_000);
    const healthTuning = getThreatTuning(healthProgress, this.model.difficulty, this.model.mission.id);
    const health = Math.max(1, Math.round(config.health * healthTuning.enemyHealth));
    enemy.setDataEnabled()
      .setData('entityId', ++this.entityId)
      .setData('kind', kind)
      .setData('textureDensity', this.dimensional ? shipTextureDensity(kind) : 1)
      .setData('displayScale', (kind === 'nullArchitect' ? 2 : kind === 'seraph' ? 1.14 : 1) / (this.dimensional ? shipTextureDensity(kind) : 1))
      .setData('health', health)
      .setData('maxHealth', health)
      .setData('originX', x)
      .setData('motionOriginX', x)
      .setData('phase', phase)
      .setData('spawnedAt', this.combatNow)
      .setData('motionStartedAt', this.combatNow)
      .setData('state', 'entry')
      .setData('combatReady', true)
      .setData('speedScale', threat.movementSpeed)
      .setData('fireScale', threat.fireRate)
      .setData('chronoScale', 1)
      .setData('openingFirstSalvoPending', kind === 'bomber' && isCoastalOpening(this.model.mission.id, progress))
      .setData('nextFire', this.combatNow + Phaser.Math.Between(900, 2_100));
    if (kind === 'bulwark') {
      enemy.setData('reactorHealth', [7, 7])
        .setData('armorBroken', false)
        .setData('armorDisabledUntil', 0)
        .setData('attackIndex', 0);
    }
    if (kind === 'carrierBoss') enemy.setData('turretHealth', [30, 30]).setData('attackIndex', 0);
    if (kind === 'gatekeeper') enemy.setData('turretHealth', [18, 18]).setData('attackIndex', 0);
    if (kind === 'nullArchitect') enemy.setData('modularBoss', createModularBoss(health));
    if (EXPANSION_BOSSES.includes(kind)) {
      const modules = (kind === 'nullArchitect' ? createSiegeModules(this) : createSeraphModules(this, this.dimensional)).setDepth(3.2);
      enemy.setData('modulesView', modules);
      this.transientViews.add(modules);
    }
    if (kind === 'reclaimer') enemy.setData('cargo', undefined);
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    const commandBody = COMMAND_ENEMIES.includes(kind);
    body.setSize(enemy.width * (commandBody ? 0.78 : 0.58), enemy.height * 0.52);
    this.createEnemyHitZones(enemy);

    if (kind === 'interceptor') {
      const fromLeft = x < 0;
      enemy.setVelocity((fromLeft ? 230 : -230) * threat.movementSpeed, config.speed * 0.7 * threat.movementSpeed);
      enemy.setAngle(fromLeft ? -24 : 24);
    } else enemy.setVelocityY(config.speed * threat.movementSpeed);

    const density = (enemy.getData('textureDensity') as number) ?? 1;
    const shadow = this.add.ellipse(x + 10, y + 34, enemy.width / density * 0.55, enemy.height / density * 0.2, 0x02050b, 0.34).setDepth(1);
    enemy.setData('shadow', shadow);
    this.transientViews.add(shadow);

    if (this.model.modifiers.threatAnalyzer && this.hitboxDefinitions(kind).some((definition) => definition.role === 'weakpoint')) {
      const analyzer = this.add.graphics().setDepth(5);
      enemy.setData('analyzer', analyzer);
      this.transientViews.add(analyzer);
    }

    if (kind === 'shieldCarrier') {
      const aura = this.add.circle(x, y, 150, 0x8b7dff, 0.05).setDepth(2).setStrokeStyle(3, 0x8b7dff, 0.58);
      enemy.setData('aura', aura);
      this.transientViews.add(aura);
    }
    if (['charger', 'mineLayer', 'shieldCarrier', 'bulwark', 'phantom', 'artillery', 'reclaimer', 'skimmer', 'weaver', 'prism', 'leech'].includes(kind) || COMMAND_ENEMIES.includes(kind)) {
      const duration = kind === 'boss' ? 1_800
        : EXPANSION_BOSSES.includes(kind) ? 1_700
        : kind === 'carrierBoss' ? 1_500
          : kind === 'warden' ? 1_400
            : kind === 'gatekeeper' || kind === 'pursuer' ? 1_250
              : kind === 'razorwing' ? 1_050
                : kind === 'bulwark' ? 1_100
                  : 900;
      this.configureDepthArrival(enemy, duration);
    }
    event('aegis:enemy-seen', kind);
    return enemy;
  }

  private countActiveEnemies(kind: EnemyKind): number {
    let count = 0;
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (enemy.active && enemy.getData('kind') === kind) count += 1;
      return true;
    });
    return count;
  }

  private hitboxDefinitions(kind: EnemyKind): readonly EnemyHitboxRect[] {
    if (kind === 'bulwark') return BULWARK_HITBOXES;
    if (kind === 'artillery') return ARTILLERY_HITBOXES;
    if (kind === 'carrierBoss') return CARRIER_BOSS_HITBOXES;
    if (kind === 'gatekeeper') return GATEKEEPER_HITBOXES;
    if (kind === 'seraph') return seraphCollisionRects(0).map((plate, index) => ({ role: index === 0 ? 'core' : 'wing', ...plate }));
    if (kind === 'boss' || kind === 'warden' || kind === 'razorwing' || kind === 'pursuer' || kind === 'elite' || kind === 'bomber') return LARGE_HITBOXES;
    // Open hulls use perimeter colliders; shots can pass through their negative space.
    if (kind === 'nullArchitect') return [
      ...SIEGE_TURRETS.map((mount) => ({ role: 'weakpoint' as const, ...mount })),
      ...SIEGE_HULL_RECTS.map((plate) => ({ role: 'core' as const, ...plate })),
    ];
    if (kind === 'weaver') return [
      { role: 'wing', x: -.3, y: 0, width: .32, height: .58 },
      { role: 'wing', x: .3, y: 0, width: .32, height: .58 },
      { role: 'core', x: 0, y: .28, width: .32, height: .4 },
    ];
    return STANDARD_HITBOXES;
  }

  private createEnemyHitZones(enemy: Phaser.Physics.Arcade.Sprite): void {
    const kind = enemy.getData('kind') as EnemyKind;
    const zones = this.hitboxDefinitions(kind).map((definition, zoneIndex) => {
      const zone = this.add.zone(enemy.x, enemy.y, 8, 8).setDataEnabled();
      this.physics.add.existing(zone);
      this.enemyHitZones.add(zone);
      zone.setData('enemy', enemy)
        .setData('role', definition.role)
        .setData('zoneIndex', zoneIndex)
        .setData('definition', definition);
      return zone;
    });
    enemy.setData('hitZones', zones);
    this.syncEnemyHitZones(enemy);
  }

  private setEnemyHitZonesEnabled(enemy: Phaser.Physics.Arcade.Sprite, enabled: boolean): void {
    if (enabled) {
      this.syncEnemyHitZones(enemy);
      return;
    }
    const zones = (enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined) ?? [];
    zones.forEach((zone) => {
      const body = zone.body as Phaser.Physics.Arcade.Body;
      body.enable = false;
      zone.setActive(body.enable);
    });
  }

  private syncEnemyHitZones(enemy: Phaser.Physics.Arcade.Sprite): void {
    const zones = (enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined) ?? [];
    const ready = enemy.getData('combatReady') !== false;
    zones.forEach((zone) => {
      if (!zone.active && zone.getData('reactorDestroyed') === true) return;
      let definition = zone.getData('definition') as EnemyHitboxRect;
      const zoneIndex = zone.getData('zoneIndex') as number;
      if (enemy.getData('kind') === 'seraph') definition = { ...definition, ...seraphCollisionRects(this.seraphPoseTime(enemy))[zoneIndex] };
      const localX = definition.x * enemy.displayWidth;
      const localY = definition.y * enemy.displayHeight;
      const cos = Math.cos(Phaser.Math.DegToRad(enemy.angle));
      const sin = Math.sin(Phaser.Math.DegToRad(enemy.angle));
      const x = enemy.x + localX * cos - localY * sin;
      const y = enemy.y + localX * sin + localY * cos;
      const width = Math.max(5, definition.width * enemy.displayWidth);
      const height = Math.max(5, definition.height * enemy.displayHeight);
      zone.setPosition(x, y).setSize(width, height);
      const body = zone.body as Phaser.Physics.Arcade.Body;
      body.setSize(width, height);
      body.reset(x, y);
      // The shielded spine remains a solid protected target. The outer plates
      // are not targets during the gun phase: otherwise front armor would make
      // the authored rear gun mounts unreachable to straight ARC projectiles.
      const outerCrownPlate = enemy.getData('kind') === 'nullArchitect' && zoneIndex > SIEGE_TURRETS.length;
      const lockedCrownPlate = outerCrownPlate && activeTurretCount(enemy.getData('modularBoss') as ModularBossState) > 0;
      body.enable = ready && zone.getData('reactorDestroyed') !== true && !lockedCrownPlate;
      zone.setActive(body.enable);
      if (this.hitboxGraphics) {
        const role = zone.getData('role') as EnemyHitZoneRole;
        const color = role === 'core' ? 0x35e8ff : role === 'weakpoint' ? 0x65ffb1 : 0xffb640;
        this.hitboxGraphics.lineStyle(1, color, body.enable ? 0.85 : 0.28).strokeRect(x - width / 2, y - height / 2, width, height);
      }
    });
  }

  private destroyEnemyHitZones(enemy: Phaser.Physics.Arcade.Sprite): void {
    const zones = (enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined) ?? [];
    zones.forEach((zone) => zone.destroy());
    enemy.setData('hitZones', undefined);
  }

  private updateEnemies(time: number, delta: number): void {
    this.enemyMotionDelta = delta;
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return true;
      if (enemy.getData('combatReady') === false) {
        this.updateDepthArrival(enemy, delta);
        return true;
      }
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      const priorChronoScale = (enemy.getData('chronoScale') as number | undefined) ?? 1;
      if (priorChronoScale !== 1) body.velocity.scale(1 / priorChronoScale);
      const kind = enemy.getData('kind') as EnemyKind;
      if (kind === 'boss') this.updateBoss(enemy, time);
      else if (kind === 'carrierBoss') this.updateCarrierBoss(enemy, time);
      else if (kind === 'warden') this.updateWarden(enemy, time);
      else if (kind === 'razorwing') this.updateRazorwing(enemy, time);
      else if (kind === 'gatekeeper') this.updateGatekeeper(enemy, time);
      else if (kind === 'pursuer') this.updatePursuer(enemy, time);
      else if (kind === 'charger') this.updateCharger(enemy, time);
      else if (kind === 'sniper') this.updateSniper(enemy, time);
      else if (kind === 'mineLayer') this.updateMineLayer(enemy, time);
      else if (kind === 'shieldCarrier') this.updateShieldCarrier(enemy, time);
      else if (kind === 'bulwark') this.updateBulwark(enemy, time);
      else if (kind === 'phantom') this.updatePhantom(enemy, time);
      else if (kind === 'artillery') this.updateArtillery(enemy, time);
      else if (kind === 'reclaimer') this.updateReclaimer(enemy);
      else if (kind === 'skimmer' || kind === 'weaver' || kind === 'prism' || kind === 'leech' || kind === 'seraph' || kind === 'nullArchitect') this.updateExpansionEnemy(enemy, kind, time);
      else this.updateStandardEnemy(enemy, kind, time);

      if (time < ((enemy.getData('gravityUntil') as number | undefined) ?? 0)) {
        const pull = steerVelocity({ x: enemy.x, y: enemy.y, vx: body.velocity.x, vy: body.velocity.y },
          enemy.getData('gravityX') as number, enemy.getData('gravityY') as number, delta, 120, 300);
        enemy.setVelocity(pull.vx, pull.vy);
      }

      const chronoScale = this.model.chronoScale;
      if (chronoScale !== 1) body.velocity.scale(chronoScale);
      enemy.setData('chronoScale', chronoScale);

      this.updateEnemyPresentation(enemy, delta);

      if (enemy.active && (enemy.y > WORLD_HEIGHT + 110 || enemy.x < -160 || enemy.x > WORLD_WIDTH + 160)) this.removeEscapedEnemy(enemy);
      return true;
    });
  }

  private configureDepthArrival(enemy: Phaser.Physics.Arcade.Sprite, duration: number): void {
    const kind = enemy.getData('kind') as EnemyKind;
    const command = COMMAND_ENEMIES.includes(kind);
    const targetY = kind === 'nullArchitect' ? 205 : EXPANSION_BOSSES.includes(kind) ? 148 : kind === 'boss' || kind === 'carrierBoss' ? 128 : kind === 'warden' || kind === 'gatekeeper' || kind === 'pursuer' ? 125 : 115;
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    this.setEnemyHitZonesEnabled(enemy, false);
    enemy.setData('combatReady', false)
      .setData('arrivalElapsed', -600)
      .setData('arrivalDuration', duration)
      .setData('arrivalTargetY', targetY)
      .setPosition(enemy.x, targetY + (command ? 190 : 145))
      .setScale((command ? 0.45 : 0.35) * ((enemy.getData('displayScale') as number) ?? 1))
      .setAlpha(0)
      .setVelocity(0, 0);
    const density = (enemy.getData('textureDensity') as number) ?? 1;
    const ring = this.add.ellipse(enemy.x, targetY + 48, enemy.width / density * 0.65, enemy.height / density * 0.25, 0x35e8ff, 0.04)
      .setDepth(1)
      .setStrokeStyle(2, command ? 0xf06cff : 0x35e8ff, 0.65);
    enemy.setData('arrivalRing', ring);
    this.transientViews.add(ring);
  }

  private updateDepthArrival(enemy: Phaser.Physics.Arcade.Sprite, delta: number): void {
    const duration = enemy.getData('arrivalDuration') as number;
    const elapsed = Math.min(duration + 120, (enemy.getData('arrivalElapsed') as number) + delta);
    const riseElapsed = Math.max(0, Math.min(duration, elapsed));
    const progress = Phaser.Math.Easing.Sine.InOut(riseElapsed / duration);
    const targetY = enemy.getData('arrivalTargetY') as number;
    const kind = enemy.getData('kind') as EnemyKind;
    const command = COMMAND_ENEMIES.includes(kind);
    const offset = command ? 190 : 145;
    enemy.setData('arrivalElapsed', elapsed)
      .setScale(Phaser.Math.Linear(command ? 0.45 : 0.35, 1, progress) * ((enemy.getData('displayScale') as number) ?? 1))
      .setAlpha(elapsed < 0 ? 0 : Phaser.Math.Linear(0.1, 1, progress))
      .setY(Phaser.Math.Linear(targetY + offset, targetY, progress));
    const ring = enemy.getData('arrivalRing') as Phaser.GameObjects.Ellipse | undefined;
    if (ring?.active) {
      const warningPulse = elapsed < 0 ? 0.62 + Math.sin(this.combatNow * 0.012) * 0.25 : 0.7 - progress * 0.45;
      ring.setPosition(enemy.x, targetY + 48).setScale(elapsed < 0 ? 1 : 1 - progress * 0.45).setAlpha(warningPulse);
    }
    this.updateEnemyPresentation(enemy, delta);
    if (elapsed < duration) return;
    if (elapsed < duration + 120) {
      enemy.setAlpha(0.72 + Math.sin(elapsed * 0.12) * 0.28);
      return;
    }
    this.destroyEnemyView(enemy, 'arrivalRing');
    enemy.setScale((enemy.getData('displayScale') as number) ?? 1).setAlpha(1).setY(targetY)
      .setData('combatReady', true)
      .setData('motionStartedAt', this.combatNow)
      .setData('motionOriginX', enemy.x)
      .setData('nextFire', this.combatNow + 450);
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setSize(enemy.width * (command ? 0.78 : 0.58), enemy.height * 0.52);
    enemy.setVelocityY(ENEMIES[kind].speed * (enemy.getData('speedScale') as number));
    this.setEnemyHitZonesEnabled(enemy, true);
    this.particles.setParticleTint(command ? 0xf06cff : 0x35e8ff);
    this.particles.explode(command ? 28 : 16, enemy.x, enemy.y);
  }

  private updateEnemyPresentation(enemy: Phaser.Physics.Arcade.Sprite, delta: number): void {
    if (enemy.getData('combatReady') !== false) {
      const kind = enemy.getData('kind') as EnemyKind;
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      if (this.dimensional) {
        // View-only bank state: never reset movement origins, velocity or hit zones.
        const lateral = visualLateralSpeed(enemy.getData('visualLastX') as number | undefined, enemy.x, delta, body.velocity.x);
        const target = Phaser.Math.Clamp(-lateral * .14, -36, 42);
        // The Crown's separate guns use the neutral hull's projected mounts.
        const bank = EXPANSION_BOSSES.includes(kind) ? 0 : easeBank((enemy.getData('visualBank') as number | undefined) ?? 0, target, delta);
        enemy.setData('visualBank', bank).setFrame(bankFrame(bank));
      } else if (['scout', 'interceptor', 'bomber', 'elite', 'razorwing', 'gatekeeper', 'pursuer'].includes(kind)) {
        const baseKey = ASSET_KEYS[kind];
        enemy.setTexture(body.velocity.x < -35 ? `${baseKey}-bank-left` : body.velocity.x > 35 ? `${baseKey}-bank-right` : baseKey);
      }
      if (!['charger', 'interceptor', 'boss', 'warden', 'razorwing'].includes(kind)) {
        // Articulated weapons have fixed world-facing barrels; bank the sprite
        // frame, not their shared weapon/collider coordinate system.
        const bankAngle = EXPANSION_BOSSES.includes(kind) ? 0 : Phaser.Math.Clamp(body.velocity.x * 0.035, -10, 10);
        enemy.angle = Phaser.Math.Linear(enemy.angle, bankAngle, 0.12);
        const scale = (enemy.getData('displayScale') as number | undefined) ?? 1;
        enemy.setScale(EXPANSION_BOSSES.includes(kind) ? scale : scale * (1 - Math.min(0.1, Math.abs(body.velocity.x) / 2_200)), scale);
      }
    }
    if (this.dimensional) enemy.setData('visualLastX', enemy.x);
    const shadow = enemy.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
    if (shadow?.active) shadow.setPosition(enemy.x + 12, enemy.y + 36)
      .setScale(Math.max(0.45, enemy.scaleX * ((enemy.getData('textureDensity') as number) ?? 1))).setAlpha(0.2 + enemy.alpha * 0.25);
    const aura = enemy.getData('aura') as Phaser.GameObjects.Arc | undefined;
    if (aura?.active) aura.setPosition(enemy.x, enemy.y);
    const carrierAura = enemy.getData('carrierAura') as Phaser.GameObjects.Arc | undefined;
    if (carrierAura?.active) carrierAura.setPosition(enemy.x, enemy.y).setRotation(this.combatNow * 0.001);
    this.syncEnemyHitZones(enemy);
    const modules = enemy.getData('modulesView') as Phaser.GameObjects.Graphics | Phaser.GameObjects.Container | undefined;
    if (modules?.active) {
      const warning = enemy.getData('state') === 'volleyWarning';
      if (enemy.getData('kind') === 'nullArchitect') drawSiegeModules(modules as Phaser.GameObjects.Container, enemy.getData('modularBoss') as ModularBossState, this.combatNow, warning);
      else drawSeraphModules(modules as Phaser.GameObjects.Container, this.seraphPoseTime(enemy), warning);
      const density = (enemy.getData('textureDensity') as number) ?? 1;
      modules.setPosition(enemy.x, enemy.y).setScale(enemy.scaleX * density, enemy.scaleY * density).setRotation(enemy.rotation).setAlpha(enemy.alpha);
    }
    const analyzer = enemy.getData('analyzer') as Phaser.GameObjects.Graphics | undefined;
    if (analyzer?.active) {
      analyzer.clear().lineStyle(2, 0x65ffb1, 0.68);
      const zones = (enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined) ?? [];
      zones.filter((zone) => zone.active && zone.getData('role') === 'weakpoint').forEach((zone) => {
        analyzer.strokeCircle(zone.x, zone.y, Math.max(8, zone.width * 0.58));
      });
    }
  }

  private seraphPoseTime(enemy: Phaser.Physics.Arcade.Sprite): number {
    return (enemy.getData('poseTime') as number | undefined) ?? 0;
  }

  private markCarrier(enemy: Phaser.Physics.Arcade.Sprite, carrierIndex: number, reinforced = true): void {
    enemy.setData('carrierIndex', carrierIndex);
    if (reinforced) {
      enemy.setData('health', Math.ceil((enemy.getData('health') as number) * 1.35))
        .setData('maxHealth', Math.ceil((enemy.getData('maxHealth') as number) * 1.35));
    }
    const aura = this.add.circle(enemy.x, enemy.y, Math.max(38, enemy.width * 0.48), 0xffb640, 0.06)
      .setDepth(2)
      .setStrokeStyle(3, 0xffcf68, 0.82);
    enemy.setData('carrierAura', aura);
    this.transientViews.add(aura);
    if (reinforced && enemy.getData('combatReady') !== false && !['boss', 'warden'].includes(enemy.getData('kind') as string)) {
      this.configureDepthArrival(enemy, 1_100);
    }
  }

  private updateStandardEnemy(enemy: Phaser.Physics.Arcade.Sprite, kind: EnemyKind, time: number): void {
    if (kind === 'bomber' && enemy.getData('state') === 'entry' && enemy.y > 135) this.beginStandardCombatMotion(enemy, time);
    if (kind === 'elite' && enemy.getData('state') === 'entry' && enemy.y > 125) this.beginStandardCombatMotion(enemy, time);
    if (kind === 'scout') this.steerEnemy(enemy, 'sweep');
    if (kind === 'bomber' && enemy.getData('state') === 'combat') {
      this.steerEnemy(enemy, enemy.getData('commandTarget') ? 'command' : 'strike');
    }
    if (kind === 'elite' && enemy.getData('state') === 'combat') {
      // Required command targets must remain available until defeated.
      this.steerEnemy(enemy, enemy.getData('commandTarget') ? 'command' : 'strike');
    }
    if (enemy.getData('openingFirstSalvoPending')) {
      // Entry travel is not part of the warning clock. The first volley is
      // readable even if the random fire timer elapsed while flying onscreen.
      if (enemy.getData('state') !== 'combat') return;
      let salvoAt = enemy.getData('openingFirstSalvoAt') as number | undefined;
      if (salvoAt === undefined) {
        salvoAt = time + COASTAL_FIRST_SALVO_WARNING_MS;
        const warning = this.add.circle(enemy.x, enemy.y + 24, 24, 0xffb640, 0.12)
          .setDepth(5).setStrokeStyle(3, 0xffcf68, 0.95);
        enemy.setData('telegraph', warning).setData('openingFirstSalvoAt', salvoAt)
          .setData('nextFire', salvoAt);
        this.transientViews.add(warning);
      }
      const warning = enemy.getData('telegraph') as Phaser.GameObjects.Arc | undefined;
      warning?.setPosition(enemy.x, enemy.y + 24).setAlpha(0.6 + 0.4 * Math.sin((salvoAt - time) * 0.008) ** 2);
      if (time < salvoAt) return;
      this.destroyEnemyView(enemy, 'telegraph');
      enemy.setData('openingFirstSalvoPending', false);
    }
    if (enemy.y > 45 && enemy.y < 470 && time >= (enemy.getData('nextFire') as number)) {
      this.enemyFire(enemy, kind);
      const base = ENEMIES[kind].fireMs / (DIFFICULTY[this.model.difficulty].enemyFireRate * (enemy.getData('fireScale') as number));
      enemy.setData('nextFire', time + base * Phaser.Math.FloatBetween(0.82, 1.24));
    }
  }

  private beginStandardCombatMotion(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    enemy.setData('state', 'combat')
      .setData('motionStartedAt', time)
      .setData('motionOriginX', enemy.x);
  }

  private steerEnemy(enemy: Phaser.Physics.Arcade.Sprite, profile: FlightProfile, hold = false): void {
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    const sample = { x: enemy.x, y: enemy.y, vx: body.velocity.x, vy: body.velocity.y };
    const motion = (enemy.getData('flightMotion') as FlightMotion | undefined)
      ?? createFlightMotion(profile, (enemy.getData('phase') as number) * 17 + (enemy.getData('originX') as number) * .013, sample);
    const next = enemy.getData('kind') === 'nullArchitect' ? stepSiegeFlight(motion, sample, this.enemyMotionDelta, hold)
      : stepFlightMotion(motion, sample, this.enemyMotionDelta, hold, enemy.getData('speedScale') as number);
    enemy.setData('flightMotion', next.state).setVelocity(next.vx, next.vy);
  }

  private updateCharger(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    const state = enemy.getData('state') as string;
    if (state === 'entry' && enemy.y >= 115) {
      enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextSpecial', time + 700);
      return;
    }
    if (state === 'hover') {
      this.steerEnemy(enemy, 'strike', true);
      if (time >= (enemy.getData('nextSpecial') as number)) {
        const targetX = this.player.x;
        const lane = this.add.rectangle(targetX, WORLD_HEIGHT / 2, 72, WORLD_HEIGHT, 0xff3f56, 0.09)
          .setDepth(2)
          .setStrokeStyle(2, 0xff667c, 0.75);
        this.transientViews.add(lane);
        this.tweens.add({ targets: lane, alpha: { from: 0.35, to: 0.8 }, duration: 130, yoyo: true, repeat: 2 });
        enemy.setData('state', 'telegraph').setData('targetX', targetX).setData('specialAt', time + 650).setData('telegraph', lane);
        this.emitSound('warning');
      }
      return;
    }
    if (state === 'telegraph' && time >= (enemy.getData('specialAt') as number)) {
      this.destroyEnemyView(enemy, 'telegraph');
      const targetX = enemy.getData('targetX') as number;
      const speedScale = enemy.getData('speedScale') as number;
      enemy.setData('state', 'dive').setVelocity(Phaser.Math.Clamp((targetX - enemy.x) * 2.2, -430, 430) * speedScale, 650 * speedScale);
      enemy.setAngle(Phaser.Math.Clamp((targetX - enemy.x) * 0.06, -24, 24));
    }
  }

  private updateSniper(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    const state = enemy.getData('state') as string;
    if (state === 'entry' && enemy.y >= 120) {
      this.beginStandardCombatMotion(enemy, time);
      enemy.setData('state', 'hover').setData('nextFire', time + 1_300);
      return;
    }
    if (state !== 'entry') this.steerEnemy(enemy, 'artillery', state !== 'hover');
    if (state === 'hover') {
      if (time >= (enemy.getData('nextFire') as number)) {
        const aim = this.add.graphics().setDepth(4);
        this.transientViews.add(aim);
        enemy.setData('state', 'tracking').setData('trackUntil', time + 700).setData('telegraph', aim);
        this.emitSound('warning');
      }
      return;
    }
    if (state === 'tracking') {
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      enemy.setData('aimAngle', angle);
      const aim = enemy.getData('telegraph') as Phaser.GameObjects.Graphics;
      if (aim?.active) {
        aim.clear().lineStyle(2, 0xff72ca, 0.62);
        aim.lineBetween(enemy.x, enemy.y, enemy.x + Math.cos(angle) * 1_500, enemy.y + Math.sin(angle) * 1_500);
      }
      if (time >= (enemy.getData('trackUntil') as number)) {
        enemy.setData('state', 'locked').setData('lockedUntil', time + 650).setData('aimAngle', angle);
        this.emitSound('warning');
      }
      return;
    }
    if (state === 'locked') {
      const angle = enemy.getData('aimAngle') as number;
      const aim = enemy.getData('telegraph') as Phaser.GameObjects.Graphics;
      if (aim?.active) {
        const pulse = 0.72 + Math.sin(time * 0.032) * 0.2;
        aim.clear().lineStyle(8, 0xff72ca, 0.12).lineBetween(enemy.x, enemy.y, enemy.x + Math.cos(angle) * 1_500, enemy.y + Math.sin(angle) * 1_500);
        aim.lineStyle(2, 0xffffff, pulse).lineBetween(enemy.x, enemy.y, enemy.x + Math.cos(angle) * 1_500, enemy.y + Math.sin(angle) * 1_500);
      }
      if (time >= (enemy.getData('lockedUntil') as number)) {
        this.fireSniperBeam(enemy, angle);
        enemy.setData('state', 'hover').setData('nextFire', time + ENEMIES.sniper.fireMs / (enemy.getData('fireScale') as number));
      }
    }
  }

  private fireSniperBeam(enemy: Phaser.Physics.Arcade.Sprite, angle: number): void {
    this.destroyEnemyView(enemy, 'telegraph');
    const line = new Phaser.Geom.Line(enemy.x, enemy.y, enemy.x + Math.cos(angle) * 1_500, enemy.y + Math.sin(angle) * 1_500);
    const beam = this.add.graphics().setDepth(5);
    beam.lineStyle(12, 0xff72ca, 0.22).lineBetween(line.x1, line.y1, line.x2, line.y2);
    beam.lineStyle(3, 0xffffff, 0.9).lineBetween(line.x1, line.y1, line.x2, line.y2);
    this.transientViews.add(beam);
    this.tweens.add({ targets: beam, alpha: 0, duration: 150, onComplete: () => this.destroyTransient(beam) });
    if (Phaser.Geom.Intersects.LineToCircle(line, new Phaser.Geom.Circle(this.player.x, this.player.y, 22))) this.damagePlayer();
    this.emitSound('laser');
  }

  private updateMineLayer(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    if (enemy.y < 125) return;
    this.steerEnemy(enemy, 'mine-run');
    if (time >= (enemy.getData('nextFire') as number)) {
      this.spawnMine(enemy.x, enemy.y + 32);
      const interval = ENEMIES.mineLayer.fireMs / (DIFFICULTY[this.model.difficulty].enemyFireRate * (enemy.getData('fireScale') as number));
      enemy.setData('nextFire', time + interval);
    }
  }

  private updateShieldCarrier(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    if (enemy.y > 125) {
      this.steerEnemy(enemy, 'escort');
    }
    const aura = enemy.getData('aura') as Phaser.GameObjects.Arc;
    if (aura?.active) aura.setPosition(enemy.x, enemy.y);
    if (enemy.y > 45 && time >= (enemy.getData('nextFire') as number)) {
      this.enemyFire(enemy, 'shieldCarrier');
      enemy.setData('nextFire', time + ENEMIES.shieldCarrier.fireMs / (DIFFICULTY[this.model.difficulty].enemyFireRate * (enemy.getData('fireScale') as number)));
    }
  }

  private updateBulwark(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    const state = enemy.getData('state') as string;
    if (state === 'entry') {
      enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', Math.max(time + 450, enemy.getData('nextFire') as number));
      return;
    }
    this.steerEnemy(enemy, 'escort', state !== 'hover');
    if (state === 'hover' && time >= (enemy.getData('nextFire') as number)) {
      const warning = this.add.graphics().setDepth(4);
      const leftX = enemy.x - enemy.displayWidth * 0.29;
      const rightX = enemy.x + enemy.displayWidth * 0.29;
      warning.lineStyle(3, 0xffb640, 0.42);
      warning.lineBetween(leftX, enemy.y + 16, this.player.x - 62, WORLD_HEIGHT + 20);
      warning.lineBetween(rightX, enemy.y + 16, this.player.x + 62, WORLD_HEIGHT + 20);
      this.transientViews.add(warning);
      enemy.setData('state', 'volleyWarning').setData('volleyAt', time + 700).setData('telegraph', warning);
      this.emitSound('warning');
      return;
    }
    if (state === 'volleyWarning' && time >= (enemy.getData('volleyAt') as number)) {
      this.destroyEnemyView(enemy, 'telegraph');
      const attackIndex = enemy.getData('attackIndex') as number;
      const leftX = enemy.x - enemy.displayWidth * 0.29;
      const rightX = enemy.x + enemy.displayWidth * 0.29;
      const fireWing = (originX: number, targetOffset: number): void => {
        const angle = Phaser.Math.Angle.Between(originX, enemy.y + 16, this.player.x + targetOffset, this.player.y);
        [-0.09, 0, 0.09].forEach((offset) => this.spawnEnemyBullet(originX, enemy.y + 16, angle + offset, true));
      };
      const firstLeft = attackIndex % 2 === 0;
      fireWing(firstLeft ? leftX : rightX, firstLeft ? -62 : 62);
      const run = this.missionRun;
      this.time.delayedCall(140, () => {
        if (run === this.missionRun && this.model.mode === 'playing' && enemy.active) {
          fireWing(firstLeft ? rightX : leftX, firstLeft ? 62 : -62);
        }
      });
      enemy.setData('attackIndex', attackIndex + 1)
        .setData('state', 'hover')
        .setData('nextFire', time + ENEMIES.bulwark.fireMs / (DIFFICULTY[this.model.difficulty].enemyFireRate * (enemy.getData('fireScale') as number)));
      this.emitSound('enemy-fire');
    }
  }

  private updatePhantom(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    const state = enemy.getData('state') as string;
    if (state === 'entry') {
      enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', Math.max(time + 650, enemy.getData('nextFire') as number));
      return;
    }
    const motionTime = time - (enemy.getData('motionStartedAt') as number);
    this.steerEnemy(enemy, 'strike', state !== 'hover');
    enemy.setAlpha(0.7 + Math.sin(motionTime * 0.006) * 0.18);
    if (state === 'hover' && time >= (enemy.getData('nextFire') as number)) {
      const warning = this.add.graphics().setDepth(4);
      warning.lineStyle(2, 0xc4a1ff, 0.48);
      warning.lineBetween(enemy.x - 28, enemy.y + 18, this.player.x - 72, WORLD_HEIGHT + 20);
      warning.lineBetween(enemy.x + 28, enemy.y + 18, this.player.x + 72, WORLD_HEIGHT + 20);
      this.transientViews.add(warning);
      enemy.setData('state', 'phaseWarning').setData('volleyAt', time + 650).setData('telegraph', warning);
      this.emitSound('warning');
      return;
    }
    if (state === 'phaseWarning' && time >= (enemy.getData('volleyAt') as number)) {
      this.destroyEnemyView(enemy, 'telegraph');
      const left = Phaser.Math.Angle.Between(enemy.x - 28, enemy.y, this.player.x - 72, this.player.y);
      const right = Phaser.Math.Angle.Between(enemy.x + 28, enemy.y, this.player.x + 72, this.player.y);
      [-0.08, 0, 0.08].forEach((offset) => {
        this.spawnEnemyBullet(enemy.x - 28, enemy.y + 18, left + offset, offset === 0);
        this.spawnEnemyBullet(enemy.x + 28, enemy.y + 18, right + offset, offset === 0);
      });
      enemy.setData('state', 'hover').setData('nextFire', time + ENEMIES.phantom.fireMs / (enemy.getData('fireScale') as number));
      this.emitSound('enemy-fire');
    }
  }

  private updateArtillery(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    const state = enemy.getData('state') as string;
    if (state === 'entry') {
      enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', Math.max(time + 800, enemy.getData('nextFire') as number));
      return;
    }
    this.steerEnemy(enemy, 'artillery', state !== 'hover');
    if (state === 'hover' && time >= (enemy.getData('nextFire') as number)) {
      const targets = [
        { x: Phaser.Math.Clamp(this.player.x - 72, 55, WORLD_WIDTH - 55), y: this.player.y },
        { x: Phaser.Math.Clamp(this.player.x + 72, 55, WORLD_WIDTH - 55), y: this.player.y - 42 },
      ];
      const markers = targets.map(({ x, y }) => {
        const marker = this.add.circle(x, y, 50, 0xff6f61, 0.06).setDepth(3).setStrokeStyle(3, 0xff927f, 0.85);
        this.transientViews.add(marker);
        this.tweens.add({ targets: marker, scale: { from: 0.78, to: 1.08 }, alpha: { from: 0.25, to: 0.72 }, duration: 260, yoyo: true, repeat: 1 });
        return marker;
      });
      enemy.setData('state', 'barrageWarning').setData('barrageAt', time + 1_100).setData('barrageTargets', targets).setData('barrageMarkers', markers);
      this.emitSound('warning');
      return;
    }
    if (state === 'barrageWarning' && time >= (enemy.getData('barrageAt') as number)) {
      const targets = (enemy.getData('barrageTargets') as Array<{ x: number; y: number }>) ?? [];
      this.clearArtilleryMarkers(enemy);
      targets.forEach(({ x, y }) => {
        const blast = this.add.circle(x, y, 18, 0xff6f61, 0.32).setDepth(5).setStrokeStyle(3, 0xffe1ba, 0.92);
        this.transientViews.add(blast);
        this.tweens.add({ targets: blast, scale: 3.4, alpha: 0, duration: 280, onComplete: () => this.destroyTransient(blast) });
        if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= 54) this.damagePlayer(false, 'hazard');
      });
      enemy.setData('state', 'hover').setData('nextFire', time + ENEMIES.artillery.fireMs / (enemy.getData('fireScale') as number));
      this.emitSound('explode');
    }
  }

  private clearArtilleryMarkers(enemy: Phaser.Physics.Arcade.Sprite): void {
    const markers = (enemy.getData('barrageMarkers') as Phaser.GameObjects.Arc[] | undefined) ?? [];
    markers.forEach((marker) => this.destroyTransient(marker));
    enemy.setData('barrageMarkers', undefined).setData('barrageTargets', undefined);
  }

  private updateReclaimer(enemy: Phaser.Physics.Arcade.Sprite): void {
    if ((enemy.getData('state') as string) === 'entry') enemy.setVelocity(0, 0).setData('state', 'seeking');
    let target: Phaser.Physics.Arcade.Sprite | undefined;
    let nearest = Number.POSITIVE_INFINITY;
    this.pickups.children.each((child) => {
      const pickup = child as Phaser.Physics.Arcade.Sprite;
      if (!pickup.active || pickup.getData('pairId') !== undefined) return true;
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, pickup.x, pickup.y);
      if (distance < nearest) {
        target = pickup;
        nearest = distance;
      }
      return true;
    });
    if (target && nearest < 430) {
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      const next = steerVelocity({ x: enemy.x, y: enemy.y, vx: body.velocity.x, vy: body.velocity.y },
        target.x, target.y, this.enemyMotionDelta, ENEMIES.reclaimer.speed * (enemy.getData('speedScale') as number), 180);
      enemy.setVelocity(next.vx, next.vy);
      // The next free-flight leg starts at the eventual pickup location, not the old entry origin.
      enemy.setData('flightMotion', undefined);
      if (nearest <= 34) {
        const cargo = target.getData('pickup') as PickupType;
        enemy.setData('cargo', cargo).setTint(0x65ffb1);
        target.destroy();
        this.announce('RECLAIMER STOLE A UTILITY');
      }
      return;
    }
    this.steerEnemy(enemy, 'escort');
  }

  private updateCarrierBoss(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    if ((enemy.getData('state') as string) === 'entry') enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', Math.max(time + 700, enemy.getData('nextFire') as number));
    const motionTime = time - (enemy.getData('motionStartedAt') as number);
    this.steerEnemy(enemy, 'command');
    const healthRatio = (enemy.getData('health') as number) / (enemy.getData('maxHealth') as number);
    this.model.setBoss('BASTION CARRIER', healthRatio);
    if (time < (enemy.getData('nextFire') as number)) return;
    const turrets = enemy.getData('turretHealth') as number[];
    const attack = enemy.getData('attackIndex') as number;
    const origins = [enemy.x - enemy.displayWidth * 0.3, enemy.x + enemy.displayWidth * 0.3];
    const activeTurrets = turrets.map((health, index) => ({ health, index })).filter(({ health }) => health > 0);
    if (activeTurrets.length === 0 || attack % 3 === 2) {
      const count = healthRatio < 0.45 ? 16 : 12;
      for (let index = 0; index < count; index += 1) this.spawnEnemyBullet(enemy.x, enemy.y + 34, (Math.PI * 2 * index) / count + motionTime * 0.00018, index % 4 === 0);
    } else {
      activeTurrets.forEach(({ index }) => {
        const aim = Phaser.Math.Angle.Between(origins[index], enemy.y + 18, this.player.x, this.player.y);
        [-0.18, -0.09, 0, 0.09, 0.18].forEach((offset) => this.spawnEnemyBullet(origins[index], enemy.y + 18, aim + offset, offset === 0));
      });
    }
    enemy.setData('attackIndex', attack + 1).setData('nextFire', time + ENEMIES.carrierBoss.fireMs * (healthRatio < 0.45 ? 0.72 : 1) / (enemy.getData('fireScale') as number));
    this.emitSound('enemy-fire');
  }

  private updateWarden(warden: Phaser.Physics.Arcade.Sprite, time: number): void {
    if (warden.getData('state') === 'entry' && warden.y < 125) {
      warden.setVelocityY(50);
      return;
    }
    if (warden.getData('state') === 'entry') this.beginStandardCombatMotion(warden, time);
    const aliveMs = time - (warden.getData('motionStartedAt') as number);
    this.steerEnemy(warden, 'command');
    const healthRatio = (warden.getData('health') as number) / (warden.getData('maxHealth') as number);
    this.model.setBoss('WARDEN', healthRatio);
    if (time < (warden.getData('nextFire') as number)) return;
    const attack = warden.getData('attackIndex') as number;
    if (attack % 2 === 0) {
      const aim = Phaser.Math.Angle.Between(warden.x, warden.y, this.player.x, this.player.y);
      for (let index = -2; index <= 2; index += 1) this.spawnEnemyBullet(warden.x, warden.y + 38, aim + index * 0.16, index === 0);
    } else {
      const count = healthRatio < 0.5 ? 14 : 10;
      for (let index = 0; index < count; index += 1) this.spawnEnemyBullet(warden.x, warden.y + 20, (Math.PI * 2 * index) / count + aliveMs * 0.00035, index % 4 === 0);
    }
    warden.setData('attackIndex', attack + 1);
    warden.setData('nextFire', time + ENEMIES.warden.fireMs * (healthRatio < 0.5 ? 0.78 : 1) / (DIFFICULTY[this.model.difficulty].enemyFireRate * (warden.getData('fireScale') as number)));
    this.emitSound('enemy-fire');
  }

  private updateRazorwing(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    const state = enemy.getData('state') as string;
    const healthRatio = (enemy.getData('health') as number) / (enemy.getData('maxHealth') as number);
    this.model.setBoss('RAZORWING ACE', healthRatio);
    if (state === 'entry') {
      enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', time + 650);
      return;
    }
    if (state === 'recover') {
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      const targetX = enemy.getData('recoveryX') as number;
      const velocity = steerVelocity({ x: enemy.x, y: enemy.y, vx: body.velocity.x, vy: body.velocity.y },
        targetX, 155, this.enemyMotionDelta, 260, 750);
      enemy.setVelocity(velocity.vx, velocity.vy);
      enemy.angle = Phaser.Math.Linear(enemy.angle, 0, .06);
      if (Math.hypot(enemy.x - targetX, enemy.y - 155) < 22 && Math.hypot(velocity.vx, velocity.vy) < 65) {
        enemy.setData('state', 'hover').setData('nextFire', time + 900);
      }
      return;
    }
    if (state === 'dive') {
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      const targetX = enemy.getData('targetX') as number;
      const velocity = steerVelocity({ x: enemy.x, y: enemy.y, vx: body.velocity.x, vy: body.velocity.y },
        targetX, 600, this.enemyMotionDelta, 460, 800);
      enemy.setVelocity(velocity.vx, velocity.vy);
      if (time >= (enemy.getData('diveEndsAt') as number) || enemy.y >= 435) {
        enemy.setData('state', 'recover').setData('recoveryX', Phaser.Math.Clamp(enemy.x, 220, WORLD_WIDTH - 220));
      }
      return;
    }
    this.steerEnemy(enemy, 'ace', state !== 'hover');
    if (state === 'hover' && time >= (enemy.getData('nextFire') as number)) {
      const attack = enemy.getData('attackIndex') as number;
      const dive = healthRatio <= 0.5 && attack % 2 === 1;
      const warning = this.add.graphics().setDepth(4);
      if (dive) {
        const targetX = this.player.x;
        warning.fillStyle(0xff557a, 0.08).fillRect(targetX - 42, 0, 84, WORLD_HEIGHT);
        warning.lineStyle(2, 0xff8aa3, 0.85).strokeRect(targetX - 42, 0, 84, WORLD_HEIGHT);
        enemy.setData('targetX', targetX);
      } else {
        const aim = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        warning.lineStyle(7, 0xff557a, 0.12).lineBetween(enemy.x, enemy.y, enemy.x + Math.cos(aim) * 1_300, enemy.y + Math.sin(aim) * 1_300);
        warning.lineStyle(2, 0xffffff, 0.7).lineBetween(enemy.x, enemy.y, enemy.x + Math.cos(aim) * 1_300, enemy.y + Math.sin(aim) * 1_300);
        enemy.setData('aimAngle', aim);
      }
      this.transientViews.add(warning);
      enemy.setData('state', dive ? 'diveWarning' : 'passWarning')
        .setData('attackAt', time + 750)
        .setData('attackIndex', attack + 1)
        .setData('telegraph', warning);
      this.emitSound('warning');
      return;
    }
    if ((state === 'diveWarning' || state === 'passWarning') && time >= (enemy.getData('attackAt') as number)) {
      this.destroyEnemyView(enemy, 'telegraph');
      if (state === 'diveWarning') {
        const targetX = enemy.getData('targetX') as number;
        const aim = Phaser.Math.Angle.Between(enemy.x, enemy.y, targetX, 560);
        enemy.setRotation(aim - Math.PI / 2).setData('state', 'dive').setData('diveEndsAt', time + 1_250);
      } else {
        const aim = enemy.getData('aimAngle') as number;
        [-0.28, -0.14, 0, 0.14, 0.28].forEach((offset) => this.spawnEnemyBullet(enemy.x, enemy.y + 22, aim + offset, offset === 0));
        enemy.setData('state', 'hover').setData('nextFire', time + ENEMIES.razorwing.fireMs / (enemy.getData('fireScale') as number));
        this.emitSound('enemy-fire');
      }
    }
  }

  private updateGatekeeper(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    const state = enemy.getData('state') as string;
    const healthRatio = (enemy.getData('health') as number) / (enemy.getData('maxHealth') as number);
    this.model.setBoss('GATEKEEPER FRIGATE', healthRatio);
    if (state === 'entry') enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', time + 800);
    this.steerEnemy(enemy, 'command', enemy.getData('state') !== 'hover');
    if (enemy.getData('state') === 'hover' && time >= (enemy.getData('nextFire') as number)) {
      const warning = this.add.graphics().setDepth(4);
      warning.fillStyle(0xffb640, 0.07).fillRect(0, enemy.y, WORLD_WIDTH / 2 - 70, WORLD_HEIGHT - enemy.y);
      warning.fillRect(WORLD_WIDTH / 2 + 70, enemy.y, WORLD_WIDTH / 2 - 70, WORLD_HEIGHT - enemy.y);
      warning.lineStyle(2, 0xffd27a, 0.7).lineBetween(WORLD_WIDTH / 2 - 70, enemy.y, WORLD_WIDTH / 2 - 70, WORLD_HEIGHT);
      warning.lineBetween(WORLD_WIDTH / 2 + 70, enemy.y, WORLD_WIDTH / 2 + 70, WORLD_HEIGHT);
      this.transientViews.add(warning);
      enemy.setData('state', 'curtainWarning').setData('attackAt', time + 700).setData('telegraph', warning);
      this.emitSound('warning');
      return;
    }
    if (enemy.getData('state') === 'curtainWarning' && time >= (enemy.getData('attackAt') as number)) {
      this.destroyEnemyView(enemy, 'telegraph');
      const turrets = enemy.getData('turretHealth') as number[];
      const origins = [enemy.x - enemy.displayWidth * 0.32, enemy.x + enemy.displayWidth * 0.32];
      turrets.forEach((health, index) => {
        if (health <= 0) return;
        const targetX = WORLD_WIDTH / 2 + (index === 0 ? -150 : 150);
        const aim = Phaser.Math.Angle.Between(origins[index], enemy.y + 16, targetX, WORLD_HEIGHT + 20);
        [-0.16, -0.08, 0, 0.08, 0.16].forEach((offset) => this.spawnEnemyBullet(origins[index], enemy.y + 16, aim + offset, offset === 0));
      });
      enemy.setData('state', 'hover').setData('nextFire', time + ENEMIES.gatekeeper.fireMs / (enemy.getData('fireScale') as number));
      this.emitSound('enemy-fire');
    }
  }

  private updatePursuer(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    const state = enemy.getData('state') as string;
    const healthRatio = (enemy.getData('health') as number) / (enemy.getData('maxHealth') as number);
    this.model.setBoss('CROWN PURSUER', healthRatio);
    if (state === 'entry') enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', time + 850);
    const motionTime = time - (enemy.getData('motionStartedAt') as number);
    this.steerEnemy(enemy, 'command', enemy.getData('state') !== 'hover');
    if (enemy.getData('state') === 'hover' && time >= (enemy.getData('nextFire') as number)) {
      const warning = this.add.graphics().setDepth(4);
      const storm = enemy.getData('routeVariant') === 'stormbreak';
      if (storm) {
        warning.lineStyle(3, 0xc66cff, 0.55);
        warning.lineBetween(enemy.x - 52, enemy.y + 20, this.player.x - 100, WORLD_HEIGHT + 20);
        warning.lineBetween(enemy.x + 52, enemy.y + 20, this.player.x + 100, WORLD_HEIGHT + 20);
      } else {
        warning.lineStyle(3, 0xffb640, 0.72).strokeCircle(this.player.x - 90, this.player.y, 42).strokeCircle(this.player.x + 90, this.player.y, 42);
        enemy.setData('mineTargets', [this.player.x - 90, this.player.x + 90]);
      }
      this.transientViews.add(warning);
      enemy.setData('state', 'routeWarning').setData('attackAt', time + 800).setData('telegraph', warning);
      this.emitSound('warning');
      return;
    }
    if (enemy.getData('state') === 'routeWarning' && time >= (enemy.getData('attackAt') as number)) {
      this.destroyEnemyView(enemy, 'telegraph');
      if (enemy.getData('routeVariant') === 'stormbreak') {
        const left = Phaser.Math.Angle.Between(enemy.x - 52, enemy.y, this.player.x - 100, this.player.y);
        const right = Phaser.Math.Angle.Between(enemy.x + 52, enemy.y, this.player.x + 100, this.player.y);
        [-0.1, 0, 0.1].forEach((offset) => {
          this.spawnEnemyBullet(enemy.x - 52, enemy.y + 20, left + offset, offset === 0);
          this.spawnEnemyBullet(enemy.x + 52, enemy.y + 20, right + offset, offset === 0);
        });
      } else {
        const targets = (enemy.getData('mineTargets') as number[]) ?? [];
        targets.forEach((targetX, index) => this.spawnMine(Phaser.Math.Clamp(targetX, 60, WORLD_WIDTH - 60), enemy.y + 34 + index * 12));
        const count = healthRatio < 0.5 ? 12 : 8;
        for (let index = 0; index < count; index += 1) this.spawnEnemyBullet(enemy.x, enemy.y + 24, (Math.PI * 2 * index) / count + motionTime * 0.0002, index % 4 === 0);
      }
      enemy.setData('state', 'hover').setData('nextFire', time + ENEMIES.pursuer.fireMs / (enemy.getData('fireScale') as number));
      this.emitSound('enemy-fire');
    }
  }

  private updateExpansionEnemy(enemy: Phaser.Physics.Arcade.Sprite, kind: PatternEnemy, time: number): void {
    const boss = EXPANSION_BOSSES.includes(kind);
    if (enemy.getData('state') === 'entry') {
      this.beginStandardCombatMotion(enemy, time);
      enemy.setData('attackIndex', 0).setData('nextFire', time + (boss ? 1200 : 850));
    }
    const state = enemy.getData('state') as string;
    if (kind === 'seraph' && state !== 'volleyWarning') enemy.setData('poseTime', this.seraphPoseTime(enemy) + this.enemyMotionDelta);
    const flight: FlightProfile = kind === 'prism' || kind === 'leech' || kind === 'skimmer' || kind === 'weaver' ? kind : 'command';
    this.steerEnemy(enemy, flight, state === 'volleyWarning');
    let modular = enemy.getData('modularBoss') as ModularBossState | undefined;
    if (modular) {
      modular = stepSiegeTurretAim(modular, enemy, this.player, enemy.displayWidth, enemy.displayHeight,
        this.enemyMotionDelta, (enemy.getData('attackIndex') as number) ?? 0, state === 'volleyWarning');
      enemy.setData('modularBoss', modular);
    }
    const healthRatio = modular ? modularHealthRatio(modular) : (enemy.getData('health') as number) / (enemy.getData('maxHealth') as number);
    if (boss) {
      const modules = modular ? activeTurretCount(modular) : 0;
      this.model.setBoss(kind === 'seraph' ? 'SERAPH // ARTICULATED GUARDIAN' : modules > 0 ? `OBSIDIAN CROWN // TURRETS ${modules}/6` : 'OBSIDIAN CROWN // HULL EXPOSED', healthRatio);
      const phase = bossPhase(healthRatio);
      if (enemy.getData('combatPhase') !== phase) {
        enemy.setData('combatPhase', phase);
        if (phase > 1) {
          this.announce(`${kind === 'seraph' ? 'SERAPH' : 'OBSIDIAN CROWN'} // PHASE ${phase}`);
          this.emitSound('warning');
        }
      }
      this.ambientWash.setAlpha(.025 + phase * .008);
    }
    if (state === 'combat' && time >= (enemy.getData('nextFire') as number) && (boss || enemy.y < 470)) {
      const plan: ModularVolley = modular && activeTurretCount(modular) > 0
        ? buildTurretVolley(modular, enemy.getData('attackIndex') as number, enemy.displayWidth, enemy.displayHeight)
        : buildEnemyVolley(kind, enemy.getData('attackIndex') as number, healthRatio,
          { x: enemy.x, y: enemy.y }, { x: this.player.x, y: this.player.y });
      if (kind === 'seraph') {
        const pose = seraphWingPose(this.seraphPoseTime(enemy), true);
        plan.shots.forEach((shot) => {
          if (Math.abs(shot.x) < 50) return;
          const density = (enemy.getData('textureDensity') as number) ?? 1;
          shot.x = Math.sign(shot.x) * pose.spread * enemy.scaleX * density;
          shot.y = (pose.barrelY + 25) * enemy.scaleY * density;
        });
      }
      const warning = this.add.graphics().setDepth(4);
      this.transientViews.add(warning);
      enemy.setData('attackPlan', plan).setData('telegraph', warning)
        .setData('state', 'volleyWarning').setData('attackAt', time + plan.warningMs);
      if (boss) {
        // Teach each pattern once; repeated banners otherwise cover the hull
        // almost continuously. The spatial warning and sound still repeat.
        const announced = (enemy.getData('announcedAttacks') as Set<string> | undefined) ?? new Set<string>();
        if (!announced.has(plan.name)) {
          announced.add(plan.name);
          enemy.setData('announcedAttacks', announced);
          this.announce(plan.name);
        }
      }
      this.emitSound('warning');
      return;
    }
    if (state !== 'volleyWarning') return;
    const plan = enemy.getData('attackPlan') as ModularVolley;
    // A destroyed pod stops contributing immediately, including during warning.
    const activeShots = plan.shots.filter((shot) => shot.module === undefined || (modular?.turrets[shot.module]?.health ?? 0) > 0);
    const warning = enemy.getData('telegraph') as Phaser.GameObjects.Graphics;
    if (warning?.active) {
      const nearFire = time > (enemy.getData('attackAt') as number) - 250;
      warning.clear().lineStyle(nearFire ? 2 : 1, plan.color, nearFire ? .48 : .18);
      activeShots.forEach((shot) => {
        const x = enemy.x + shot.x, y = enemy.y + shot.y;
        warning.lineBetween(x, y, x + Math.cos(shot.angle) * 950, y + Math.sin(shot.angle) * 950);
        warning.strokeCircle(x, y, nearFire ? 10 : 6);
      });
    }
    if (time < (enemy.getData('attackAt') as number)) return;
    this.destroyEnemyView(enemy, 'telegraph');
    activeShots.forEach((shot) => this.spawnEnemyBullet(enemy.x + shot.x, enemy.y + shot.y, shot.angle, shot.heavy, shot.ion));
    const fireScale = (enemy.getData('fireScale') as number) * DIFFICULTY[this.model.difficulty].enemyFireRate;
    enemy.setData('state', 'combat').setData('attackPlan', undefined)
      .setData('attackIndex', (enemy.getData('attackIndex') as number) + 1)
      .setData('nextFire', time + Math.max(950, plan.recoveryMs / fireScale));
    this.emitSound('enemy-fire');
  }

  private enemyFire(enemy: Phaser.Physics.Arcade.Sprite, kind: EnemyKind): void {
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    if (kind === 'bomber') [-0.22, 0, 0.22].forEach((offset) => this.spawnEnemyBullet(enemy.x, enemy.y + 25, angle + offset, false));
    else if (kind === 'elite') [-0.3, -0.15, 0, 0.15, 0.3].forEach((offset) => this.spawnEnemyBullet(enemy.x, enemy.y + 28, angle + offset, true));
    else this.spawnEnemyBullet(enemy.x, enemy.y + 18, angle, false);
    this.emitSound('enemy-fire');
  }

  private spawnEnemyBullet(x: number, y: number, angle: number, heavy: boolean, ion = false): void {
    if (this.enemyBullets.countActive(true) >= MAX_HOSTILE_PROJECTILES) return;
    const art = ion ? HOSTILE_PROJECTILE_ART.ion : heavy ? HOSTILE_PROJECTILE_ART.heavy : HOSTILE_PROJECTILE_ART.standard;
    const key = art.key;
    const bullet = this.enemyBullets.get(x, y, key) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;
    bullet.setTexture(key).setPosition(x, y).setActive(true).setVisible(true).setDepth(4)
      .setScale(1).setAlpha(1).clearTint().setRotation(angle - Math.PI / 2);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setCircle(art.radius, bullet.width / 2 - art.radius, bullet.height / 2 - art.radius);
    const progress = this.model.stageElapsedMs / Math.max(1, this.model.stageDurationMs);
    const threat = getThreatTuning(progress, this.model.difficulty, this.model.mission.id);
    const speed = (heavy ? 245 : 300) * DIFFICULTY[this.model.difficulty].enemyBulletSpeed * threat.bulletSpeed * this.model.chronoScale;
    this.physics.velocityFromRotation(angle, speed, body.velocity);
    bullet.setDataEnabled().setData('chronoScale', this.model.chronoScale);
  }

  private reflectHostileBullet(projectile: Phaser.Physics.Arcade.Sprite): void {
    const reflected = this.playerBullets.get(projectile.x, projectile.y, ASSET_KEYS.playerBullet) as Phaser.Physics.Arcade.Sprite | null;
    if (!reflected) return;
    const incoming = projectile.body as Phaser.Physics.Arcade.Body;
    reflected.setTexture(ASSET_KEYS.playerBullet).setPosition(projectile.x, projectile.y).setActive(true).setVisible(true).setDepth(5).setTint(0x8b7dff);
    const body = reflected.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setSize(8, 22);
    const speed = Math.max(620, incoming.velocity.length() * 1.4);
    const angle = Phaser.Math.Angle.Between(projectile.x, projectile.y, projectile.x - incoming.velocity.x, projectile.y - Math.abs(incoming.velocity.y));
    this.physics.velocityFromRotation(angle, speed, body.velocity);
    reflected.setRotation(angle + Math.PI / 2).setDataEnabled()
      .setData('damage', 6 * this.model.damageMultiplier)
      .setData('missile', false)
      .setData('pierce', 0)
      .setData('hitTargets', new Set<number>());
  }

  private spawnMine(x: number, y: number): void {
    if (this.mines.countActive(true) >= MAX_ACTIVE_MINES) return;
    const mine = this.physics.add.sprite(x, y, ASSET_KEYS.mine).setDepth(3).setScale(0.72).setAlpha(0.55);
    this.mines.add(mine);
    mine.setDataEnabled()
      .setData('armed', false)
      .setData('armedAt', this.combatNow + 750)
      .setData('expiresAt', this.combatNow + 6_000)
      .setData('health', 3)
      .setData('chronoScale', 1)
      .setVelocityY(44);
    (mine.body as Phaser.Physics.Arcade.Body).setCircle(18, 10, 10);
    this.tweens.add({ targets: mine, scale: 1, alpha: 1, duration: 750 });
  }

  private updateMines(time: number, delta: number): void {
    this.mines.children.each((child) => {
      const mine = child as Phaser.Physics.Arcade.Sprite;
      if (!mine.active) return true;
      const body = mine.body as Phaser.Physics.Arcade.Body;
      const previousScale = (mine.getData('chronoScale') as number | undefined) ?? 1;
      const nextScale = this.model.chronoScale;
      if (previousScale !== nextScale) body.velocity.scale(nextScale / previousScale);
      mine.setData('chronoScale', nextScale);
      mine.rotation += delta * 0.0018;
      if (!mine.getData('armed') && time >= (mine.getData('armedAt') as number)) {
        mine.setData('armed', true).setTint(0xffc05a);
        this.particles.setParticleTint(0xffb640);
        this.particles.explode(8, mine.x, mine.y);
      }
      if (time >= (mine.getData('expiresAt') as number) || mine.y > WORLD_HEIGHT + 60) this.destroyMine(mine, false);
      return true;
    });
  }

  private hitMine(bullet: Phaser.Physics.Arcade.Sprite, mine: Phaser.Physics.Arcade.Sprite): void {
    if (!bullet.active || !mine.active) return;
    this.model.registerHit();
    this.disableBody(bullet);
    const health = (mine.getData('health') as number) - (bullet.getData('damage') as number);
    mine.setData('health', health);
    if (health <= 0) this.destroyMine(mine);
  }

  private destroyMine(mine: Phaser.Physics.Arcade.Sprite, explode = true): void {
    if (!mine.active) return;
    const { x, y } = mine;
    mine.destroy();
    if (explode) {
      this.particles.setParticleTint(0xffb640);
      this.particles.explode(16, x, y);
      this.emitSound('explode');
    }
  }

  private spawnBoss(initialHealthRatio = 1): void {
    if (this.bossSpawned || this.model.mode !== 'playing') return;
    const kind = finaleBossKind(this.model.mission.id, this.model.finaleBossStage) ?? 'boss';
    const name = kind === 'seraph' ? 'SERAPH // RELAY GUARDIAN' : kind === 'nullArchitect' ? 'OBSIDIAN CROWN' : 'DREADNOUGHT';
    this.bossSpawned = true;
    this.model.setFinalePhase('boss');
    this.enemies.clear(true, true);
    this.enemyHitZones.clear(true, true);
    this.enemyBullets.clear(true, true);
    this.mines.clear(true, true);
    this.cleanupDetachedViews();
    if (kind === 'boss') {
      this.model.restoreShield();
      this.shieldPulse(0x35e8ff, 1.25);
    }
    this.announce(`WARNING // ${name}`);
    this.emitSound('warning');
    event('aegis:music', 'boss');
    this.cameras.main.shake(550, 0.006);
    this.boss = this.spawnEnemy(kind, WORLD_WIDTH / 2, -100, 0);
    this.boss?.setData('attackIndex', 0);
    if (this.boss && initialHealthRatio < 1) {
      const maxHealth = this.boss.getData('maxHealth') as number;
      this.boss.setData('health', Math.max(1, Math.round(maxHealth * initialHealthRatio)));
    }
    this.model.setBoss(name, initialHealthRatio);
  }

  private updateBoss(boss: Phaser.Physics.Arcade.Sprite, time: number): void {
    if (boss.getData('state') === 'entry' && boss.y < 128) {
      boss.setVelocityY(54);
      return;
    }
    if (boss.getData('state') === 'entry') this.beginStandardCombatMotion(boss, time);
    const aliveMs = time - (boss.getData('motionStartedAt') as number);
    this.steerEnemy(boss, 'command');
    const healthRatio = (boss.getData('health') as number) / (boss.getData('maxHealth') as number);
    this.model.setBoss('DREADNOUGHT', healthRatio);
    if ((this.model.latestWaypointId ?? 0) < 2 && healthRatio <= 0.66) this.secureWaypoint(2);
    if (time < (boss.getData('nextFire') as number)) return;

    const attackIndex = boss.getData('attackIndex') as number;
    const phase = healthRatio > 0.66 ? 1 : healthRatio > 0.33 ? 2 : 3;
    this.ambientWash.setAlpha(0.025 + phase * 0.012 + Math.sin(aliveMs * 0.004) * 0.008);
    boss.setTint(phase === 1 ? 0xffffff : phase === 2 ? 0xffccd6 : 0xff8fa0);
    if (phase === 1 || attackIndex % 3 === 0) {
      const aim = Phaser.Math.Angle.Between(boss.x, boss.y, this.player.x, this.player.y);
      const spread = phase === 3 ? 4 : 3;
      for (let index = -spread; index <= spread; index += 1) this.spawnEnemyBullet(boss.x, boss.y + 40, aim + index * 0.12, index % 2 === 0);
    } else {
      const count = phase === 2 ? 16 : 20;
      for (let index = 0; index < count; index += 1) {
        this.spawnEnemyBullet(boss.x, boss.y + 25, (Math.PI * 2 * index) / count + aliveMs * 0.0002, index % 5 === 0);
      }
    }
    boss.setData('attackIndex', attackIndex + 1);
    boss.setData('nextFire', time + ENEMIES.boss.fireMs * (phase === 1 ? 1 : phase === 2 ? 0.82 : 0.66) / DIFFICULTY[this.model.difficulty].enemyFireRate);
    this.emitSound('enemy-fire');
  }

  private hitEnemy(bullet: Phaser.Physics.Arcade.Sprite, zone: Phaser.GameObjects.Zone): void {
    const enemy = zone.getData('enemy') as Phaser.Physics.Arcade.Sprite;
    if (!bullet.active || !enemy.active || enemy.getData('combatReady') === false) return;
    const targetId = enemy.getData('entityId') as number;
    const hitTargets = bullet.getData('hitTargets') as Set<number>;
    if (hitTargets.has(targetId)) return;
    hitTargets.add(targetId);
    this.model.registerHit();
    const damage = bullet.getData('damage') as number;
    const missile = bullet.getData('missile') as boolean;
    const impactX = zone.x;
    const impactY = zone.y;
    const pierce = bullet.getData('pierce') as number;
    if (pierce > 0) bullet.setData('pierce', pierce - 1);
    else this.disableBody(bullet);
    const overdriveVisual = Boolean(bullet.getData('overdriveVisual'));
    this.damageEnemy(enemy, damage, zone.getData('role') as EnemyHitZoneRole, zone.getData('zoneIndex') as number, overdriveVisual);
    const missileLevel = this.model.weapons.missile;
    const nova = getNovaVolley(missileLevel);
    const splashRadius = this.model.modifiers.phaseArsenal ? 75 : nova.splashRadius;
    if (missile && splashRadius > 0) {
      this.applyMissileSplash(impactX, impactY, targetId, damage * nova.splashDamageMultiplier, splashRadius, overdriveVisual);
      if (this.model.modifiers.gravityPayload) this.pullRegularEnemies(impactX, impactY, Math.max(100, splashRadius + 35));
    }
    const weaponKind = bullet.getData('weaponKind') as WeaponType | undefined;
    const impactCue: Partial<Record<WeaponType, SoundCue>> = {
      spread: 'arc-impact', missile: 'nova-impact', laser: 'lance-impact', drone: 'wing-impact', ion: 'ion-impact',
    };
    if (weaponKind && impactCue[weaponKind]) this.emitSound(impactCue[weaponKind]!, impactX);
    if (weaponKind) this.weaponImpact(weaponKind, impactX, impactY, overdriveVisual);
    if (this.model.modifiers.resonanceMatrix && (weaponKind === 'spread' || weaponKind === 'laser')) {
      this.resonanceHits += 1;
      if (this.resonanceHits % 10 === 0) {
        this.ionArc(impactX, impactY, this.player.x, this.player.y - 20);
        this.applyIonDischarge(impactX, impactY, targetId, 3.5 * this.model.damageMultiplier);
      }
    }
  }

  private weaponImpact(kind: WeaponType, x: number, y: number, overdrive: boolean): void {
    if (kind === 'missile' || kind === 'ion') return;
    const color = overdrive ? OVERDRIVE_GOLD : kind === 'spread' ? 0x35e8ff : kind === 'laser' ? 0xf06cff : 0x65ffb1;
    const impact = kind === 'laser'
      ? this.add.rectangle(x, y, 8, 34, color, 0.3).setStrokeStyle(2, overdrive ? OVERDRIVE_CORE : 0xffffff, 0.86)
      : this.add.circle(x, y, kind === 'spread' ? 7 : 5, color, 0.22).setStrokeStyle(2, overdrive ? OVERDRIVE_CORE : color, 0.9);
    impact.setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    this.transientViews.add(impact);
    this.tweens.add({ targets: impact, scale: kind === 'laser' ? 1.8 : 3.2, alpha: 0, duration: kind === 'laser' ? 150 : 120, onComplete: () => this.destroyTransient(impact) });
  }

  private applyMissileSplash(x: number, y: number, excludedId: number, damage: number, radius: number, overdriveVisual = false): void {
    const targets: Phaser.Physics.Arcade.Sprite[] = [];
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (enemy.active && enemy.getData('combatReady') !== false && enemy.getData('entityId') !== excludedId && Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= radius) targets.push(enemy);
      return true;
    });
    targets.forEach((enemy) => this.damageEnemy(enemy, damage, 'core', -1, overdriveVisual, true));
    const blast = this.add.circle(x, y, 16, OVERDRIVE_GOLD, overdriveVisual ? 0.28 : 0.18)
      .setDepth(5)
      .setStrokeStyle(2, overdriveVisual ? OVERDRIVE_CORE : 0xffe7a0, 0.8);
    this.transientViews.add(blast);
    this.tweens.add({ targets: blast, scale: radius / 16, alpha: 0, duration: 240, onComplete: () => this.destroyTransient(blast) });
  }

  private pullRegularEnemies(x: number, y: number, radius: number): void {
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      const kind = enemy.getData('kind') as EnemyKind;
      if (enemy.active && !COMMAND_ENEMIES.includes(kind) && kind !== 'bulwark' && Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= radius) {
        // Gravity Payload is a short force, never an instantaneous velocity reset on a hit.
        enemy.setData('gravityX', x).setData('gravityY', y).setData('gravityUntil', this.combatNow + 450);
      }
      return true;
    });
  }

  private damageEnemy(
    enemy: Phaser.Physics.Arcade.Sprite,
    rawDamage: number,
    role: EnemyHitZoneRole = 'core',
    zoneIndex = -1,
    overdriveVisual = false,
    areaDamage = false,
  ): void {
    if (!enemy.active || enemy.getData('combatReady') === false) return;
    const kind = enemy.getData('kind') as EnemyKind;
    if (kind === 'nullArchitect') {
      const previous = enemy.getData('modularBoss') as ModularBossState;
      const target: ModuleDamageTarget = areaDamage ? { kind: 'area' }
        : zoneIndex >= 0 ? role === 'weakpoint' ? { kind: 'turret', index: zoneIndex } : { kind: 'hull' }
          : { kind: 'auto' };
      const result = damageModularBoss(previous, rawDamage, target);
      enemy.setData('modularBoss', result.state).setData('health', result.state.hull);
      if (result.blocked) {
        this.particles.setParticleTint(0xa590ff);
        this.particles.explode(2, enemy.x, enemy.y + enemy.displayHeight * .27);
        return;
      }
      const zones = (enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined) ?? [];
      for (const index of result.destroyed) {
        const zone = zones[index];
        if (zone) {
          zone.setData('reactorDestroyed', true).setActive(false);
          (zone.body as Phaser.Physics.Arcade.Body).enable = false;
          this.particles.setParticleTint(0xffa578);
          this.particles.explode(24, zone.x, zone.y);
          if (this.model.mission.id === 'lastLight') this.siegeBreachPulse(zone.x, zone.y);
        }
        this.emitSound('explode');
      }
      if (result.destroyed.length > 0) this.announce(`SIEGE TURRET DESTROYED // ${activeTurretCount(result.state)} REMAIN`);
      if (result.unlocked) {
        this.destroyEnemyView(enemy, 'telegraph');
        enemy.setData('state', 'combat').setData('nextFire', this.combatNow + 1800).setData('attackPlan', undefined);
        this.announce('ALL TURRETS DISABLED // HULL EXPOSED');
        this.cameras.main.shake(180, .003);
        this.emitSound('shield-hit');
      }
      if (result.state.hull <= 0) this.destroyEnemy(enemy);
      return;
    }
    if (kind === 'bulwark' && role === 'weakpoint') {
      const reactorIndex = Math.max(0, zoneIndex - 3);
      const reactors = [...(enemy.getData('reactorHealth') as number[])];
      if ((reactors[reactorIndex] ?? 0) <= 0) return;
      reactors[reactorIndex] = Math.max(0, reactors[reactorIndex] - rawDamage);
      enemy.setData('reactorHealth', reactors);
      this.particles.setParticleTint(overdriveVisual ? OVERDRIVE_GOLD : 0x65ffb1);
      this.particles.explode(6, enemy.x + (reactorIndex === 0 ? -41 : 41), enemy.y + 4);
      if (reactors[reactorIndex] <= 0) {
        enemy.setData('armorBroken', true);
        const zone = ((enemy.getData('hitZones') as Phaser.GameObjects.Zone[]) ?? [])[zoneIndex];
        if (zone) {
          zone.setData('reactorDestroyed', true).setActive(false);
          (zone.body as Phaser.Physics.Arcade.Body).enable = false;
        }
        this.announce(`BULWARK ${reactorIndex === 0 ? 'PORT' : 'STARBOARD'} REACTOR DESTROYED`);
        this.emitSound('explode');
      }
      return;
    }
    if (kind === 'artillery' && role === 'weakpoint' && enemy.getData('state') === 'barrageWarning') {
      this.clearArtilleryMarkers(enemy);
      enemy.setData('state', 'hover').setData('nextFire', this.combatNow + 1_600);
      this.announce('ARTILLERY LOCK INTERRUPTED');
      rawDamage *= 1.5;
    }
    if (kind === 'carrierBoss' && role === 'weakpoint') {
      const turretIndex = Math.max(0, zoneIndex - 2);
      const turrets = [...(enemy.getData('turretHealth') as number[])];
      if ((turrets[turretIndex] ?? 0) > 0) {
        turrets[turretIndex] = Math.max(0, turrets[turretIndex] - rawDamage);
        enemy.setData('turretHealth', turrets);
        rawDamage *= 1.25;
        if (turrets[turretIndex] <= 0) {
          const zone = ((enemy.getData('hitZones') as Phaser.GameObjects.Zone[]) ?? [])[zoneIndex];
          if (zone) {
            zone.setData('reactorDestroyed', true).setActive(false);
            (zone.body as Phaser.Physics.Arcade.Body).enable = false;
          }
          this.announce(`BASTION ${turretIndex === 0 ? 'PORT' : 'STARBOARD'} TURRET DISABLED`);
          this.emitSound('explode');
        }
      }
    }
    if (kind === 'gatekeeper' && role === 'weakpoint') {
      const turretIndex = Math.max(0, zoneIndex - 2);
      const turrets = [...(enemy.getData('turretHealth') as number[])];
      if ((turrets[turretIndex] ?? 0) > 0) {
        turrets[turretIndex] = Math.max(0, turrets[turretIndex] - rawDamage);
        enemy.setData('turretHealth', turrets);
        rawDamage *= 1.2;
        if (turrets[turretIndex] <= 0) {
          const zone = ((enemy.getData('hitZones') as Phaser.GameObjects.Zone[]) ?? [])[zoneIndex];
          if (zone) {
            zone.setData('reactorDestroyed', true).setActive(false);
            (zone.body as Phaser.Physics.Arcade.Body).enable = false;
          }
          this.announce(`GATEKEEPER ${turretIndex === 0 ? 'PORT' : 'STARBOARD'} TURRET DISABLED`);
          this.emitSound('explode');
        }
      }
    }
    const protectedByCarrier = kind !== 'shieldCarrier' && !COMMAND_ENEMIES.includes(kind) && this.isProtectedByCarrier(enemy);
    const bulwarkArmor = kind === 'bulwark'
      && !enemy.getData('armorBroken')
      && this.combatNow >= ((enemy.getData('armorDisabledUntil') as number | undefined) ?? 0)
      && role === 'core';
    const shieldMitigation = this.model.difficulty === 'cadet' ? .55 : this.model.difficulty === 'pilot' ? .4 : .3;
    const damage = rawDamage * (protectedByCarrier ? shieldMitigation : 1) * (bulwarkArmor ? 0.45 : 1);
    const health = (enemy.getData('health') as number) - damage;
    enemy.setData('health', health);
    // A filled tint hides Seraph's materials under sustained multi-weapon fire.
    // Multiplicative tint keeps its armor readable even between rapid impacts.
    if (kind === 'seraph') enemy.setTint(0xffe9d6);
    else enemy.setTintFill(protectedByCarrier ? 0x8b7dff : 0xffffff);
    this.time.delayedCall(45, () => enemy.active && enemy.clearTint());
    this.particles.setParticleTint(overdriveVisual ? OVERDRIVE_GOLD : protectedByCarrier ? 0x8b7dff : ['elite', 'warden', 'pursuer'].includes(kind) ? 0xf06cff : 0xff6f61);
    const impactZone = kind === 'seraph' && zoneIndex >= 0
      ? (enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined)?.[zoneIndex]
      : undefined;
    this.particles.explode(3, impactZone?.x ?? enemy.x, impactZone?.y ?? enemy.y);
    if (health <= 0) this.destroyEnemy(enemy);
  }

  /** A destroyed siege battery creates one small tactical opening. It grants no
   * resources or invulnerability and cannot repeat on an already-dead module. */
  private siegeBreachPulse(x: number, y: number): void {
    const radius = 165;
    this.clearEnemyBullets(x, y, radius, false);
    const ring = this.add.circle(x, y, 18, 0x63edff, .055).setDepth(5).setStrokeStyle(2, 0xa4f9ff, .75);
    this.transientViews.add(ring);
    this.tweens.add({ targets: ring, scale: radius / 18, alpha: 0, duration: 480, ease: 'Quad.out', onComplete: () => this.destroyTransient(ring) });
  }

  private isProtectedByCarrier(target: Phaser.Physics.Arcade.Sprite): boolean {
    if (target.getData('kind') === 'bulwark' && this.model.difficulty !== 'ace') return false;
    let protectedTarget = false;
    this.enemies.children.each((child) => {
      const carrier = child as Phaser.Physics.Arcade.Sprite;
      if (carrier.active && carrier.getData('combatReady') !== false && carrier.getData('kind') === 'shieldCarrier' && Phaser.Math.Distance.Between(target.x, target.y, carrier.x, carrier.y) <= 150) {
        protectedTarget = true;
        return false;
      }
      return true;
    });
    return protectedTarget;
  }

  private destroyEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    if (!enemy.active) return;
    const kind = enemy.getData('kind') as EnemyKind;
    const commandTarget = Boolean(enemy.getData('commandTarget'));
    const carrierIndex = enemy.getData('carrierIndex') as number | undefined;
    const cargo = enemy.getData('cargo') as PickupType | undefined;
    const x = enemy.x;
    const y = enemy.y;
    const maxHealth = enemy.getData('maxHealth') as number;
    this.destroyEnemyView(enemy, 'telegraph');
    this.destroyEnemyView(enemy, 'aura');
    this.destroyEnemyView(enemy, 'shadow');
    this.destroyEnemyView(enemy, 'arrivalRing');
    this.destroyEnemyView(enemy, 'carrierAura');
    this.destroyEnemyView(enemy, 'analyzer');
    this.destroyEnemyView(enemy, 'modulesView');
    this.clearArtilleryMarkers(enemy);
    this.destroyEnemyHitZones(enemy);
    enemy.destroy();
    const commandExplosion = COMMAND_ENEMIES.includes(kind);
    this.particles.setParticleTint(kind === 'boss' ? 0xffb640 : commandExplosion ? 0xf06cff : 0xff6f61);
    this.particles.explode(kind === 'boss' ? 90 : commandExplosion ? 58 : Math.min(28, 8 + maxHealth), x, y);
    this.emitSound('explode');

    if (this.isolatedCraftPreview) {
      this.boss = undefined;
      this.model.setBoss('', 0);
      this.announce('CRAFT DESTROYED // ISOLATE TO REPLAY');
      return;
    }

    const reward = this.model.registerKill(ENEMIES[kind].score, ENEMIES[kind].credits, SPECIALISTS.includes(kind));
    if (reward.credits > 0) this.creditPopup(x, y, reward.credits);
    if (reward.overdriveTriggered) this.announce('OVERDRIVE REACTOR // CHAIN HOT');
    if (reward.fabricatedPickup) this.spawnPickup(x, y, reward.fabricatedPickup);
    if (carrierIndex !== undefined && this.model.modifiers.fabricationMatrix) this.spawnPickup(x, y + 24);
    if (carrierIndex !== undefined) this.spawnArmamentOffer(x, y, carrierIndex);
    if (kind === 'reclaimer' && cargo) this.spawnPickup(x, y, cargo);

    if (commandTarget) this.commandRemaining = Math.max(0, this.commandRemaining - 1);
    if (kind === 'warden') {
      this.commandEncounterActive = false;
      this.model.setBoss('', 0);
      this.announce('WARDEN DESTROYED // ROUTE OPEN');
    }
    if (kind === 'carrierBoss') {
      this.commandEncounterActive = false;
      this.model.setBoss('', 0);
      this.announce('BASTION CARRIER DESTROYED // FINAL VECTOR OPEN');
    }
    if (['razorwing', 'gatekeeper', 'pursuer'].includes(kind)) {
      this.commandEncounterActive = false;
      this.model.setBoss('', 0);
      this.nextWaveAt = this.combatNow + 2_000;
      this.announce(`${kind === 'razorwing' ? 'RAZORWING ACE' : kind === 'gatekeeper' ? 'GATEKEEPER FRIGATE' : 'CROWN PURSUER'} DESTROYED`);
    }
    if (kind === 'seraph' && this.model.mission.id === 'lastLight') {
      this.boss = undefined;
      if (this.model.advanceFinaleBoss()) {
        this.bossSpawned = false;
        this.enemyBullets.clear(true, true);
        this.playerBullets.clear(true, true);
        this.mines.clear(true, true);
        this.secureWaypoint(2);
        this.announce('SERAPH DESTROYED // OBSIDIAN CROWN AWAKENS');
        this.scheduleBoss(2600);
      }
      return;
    }
    if (kind === 'boss' || kind === 'nullArchitect') {
      this.boss = undefined;
      this.completeMission(true);
      return;
    }

    this.killsSinceUtilityDrop += 1;
    if (carrierIndex === undefined && shouldDropUtility(this.model.difficulty, this.killsSinceUtilityDrop)) {
      this.spawnPickup(x, y);
      this.killsSinceUtilityDrop = 0;
    }
    if (reward.points >= 2_000) this.announce(`CHAIN ×${this.model.multiplier}`);
  }

  private creditPopup(x: number, y: number, credits: number): void {
    const label = this.add.text(x, y, `+${credits} C`, {
      color: '#ffcf68', fontFamily: 'Arial Narrow, sans-serif', fontSize: '15px', fontStyle: 'bold', stroke: '#1b0e08', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(9);
    this.transientViews.add(label);
    this.tweens.add({ targets: label, y: y - 42, alpha: 0, duration: 720, onComplete: () => this.destroyTransient(label) });
  }

  private spawnPickup(x: number, y: number, forcedType?: PickupType): void {
    const type = forcedType ?? chooseUtilityPickup(
      this.model.hull,
      this.model.hullMax,
      this.model.empCharges,
      this.model.empMax,
      Math.random,
      this.lastUtility,
      this.model.modifiers.utilityDurationMultiplier > 1,
      { overdrive: this.model.snapshot().overdriveRemainingMs > 0, tractor: this.model.snapshot().tractorRemainingMs > 0 },
    );
    if (isUtilityPickup(type)) this.lastUtility = type;
    const pickup = this.physics.add.sprite(
      Phaser.Math.Clamp(x, PICKUP_HORIZONTAL_MARGIN, WORLD_WIDTH - PICKUP_HORIZONTAL_MARGIN),
      y,
      `${ASSET_KEYS.pickupPrefix}${type}`,
    ).setDepth(5);
    this.pickups.add(pickup);
    pickup.setDataEnabled().setData('pickup', type).setVelocityY(92);
    (pickup.body as Phaser.Physics.Arcade.Body).setCircle(22, 8, 8);
    this.tweens.add({ targets: pickup, scale: { from: 0.88, to: 1.06 }, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private spawnArmamentOffer(x: number, y: number, carrierIndex: number): void {
    const previousPair = this.armamentOfferHistory.at(-1);
    const recentOptions = this.armamentOfferHistory.flat().slice(-4);
    const offer = chooseArmamentOffer(
      this.model.weapons,
      this.model.shieldBaseMax,
      this.model.campaignSeed,
      carrierIndex,
      recentOptions,
      previousPair,
    );
    this.armamentOfferHistory.push(offer.options);
    const pairId = ++this.offerId;
    const centerX = Phaser.Math.Clamp(x, PICKUP_HORIZONTAL_MARGIN + 42, WORLD_WIDTH - PICKUP_HORIZONTAL_MARGIN - 42);
    offer.options.forEach((type, index) => {
      const pickup = this.physics.add.sprite(centerX + (index === 0 ? -42 : 42), y, `${ASSET_KEYS.pickupPrefix}${type}`).setDepth(6);
      this.pickups.add(pickup);
      pickup.setDataEnabled()
        .setData('pickup', type)
        .setData('pairId', pairId)
        .setData('settleY', Math.max(y, STATIONARY_PICKUP_SAFE_Y))
        .setData('expiresAt', this.combatNow + offer.expiresAfterMs)
        .setVelocity(0, y < STATIONARY_PICKUP_SAFE_Y ? 150 : 0)
        .setTint(0xffe6a3);
      (pickup.body as Phaser.Physics.Arcade.Body).setCircle(22, 8, 8);
      this.tweens.add({ targets: pickup, scale: { from: 0.82, to: 1.12 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });
    this.announce('ARMAMENT CORE // CHOOSE ONE');
  }

  private updatePickups(delta: number): void {
    const tractorRadius = this.model.tractorRadius;
    this.pickups.children.each((child) => {
      const pickup = child as Phaser.Physics.Arcade.Sprite;
      if (!pickup.active) return true;
      pickup.rotation += delta * 0.0007;
      const expiresAt = pickup.getData('expiresAt') as number | undefined;
      if (expiresAt !== undefined && this.combatNow >= expiresAt) {
        pickup.destroy();
        return true;
      }
      const distance = Phaser.Math.Distance.Between(pickup.x, pickup.y, this.player.x, this.player.y);
      const tractorEligible = canTractorPickup(pickup.getData('pairId') as number | undefined);
      if (!tractorEligible) {
        const settleY = Math.max(STATIONARY_PICKUP_SAFE_Y, pickup.getData('settleY') as number || STATIONARY_PICKUP_SAFE_Y);
        pickup.x = Phaser.Math.Clamp(pickup.x, PICKUP_HORIZONTAL_MARGIN, WORLD_WIDTH - PICKUP_HORIZONTAL_MARGIN);
        if (pickup.y < settleY) pickup.setVelocity(0, 150);
        else pickup.setY(settleY).setVelocity(0, 0);
      } else if (tractorRadius > 0 && distance <= tractorRadius) this.physics.moveToObject(pickup, this.player, 380);
      else pickup.setVelocity(0, 92);

      // Any stationary reward that somehow enters the unreachable strip is returned to play.
      const body = pickup.body as Phaser.Physics.Arcade.Body;
      if (pickup.y < STATIONARY_PICKUP_SAFE_Y && Math.abs(body.velocity.y) < 1) pickup.setVelocityY(92);
      if (pickup.y > WORLD_HEIGHT + 60) pickup.destroy();
      return true;
    });
  }

  private collectPickup(type: PickupType): void {
    if (this.model.mode !== 'playing') return;
    if (isUtilityPickup(type)) {
      const previousEmp = this.model.empCharges;
      const result = this.model.collectUtility(type);
      const labels: Record<UtilityPickupType, string> = {
        repair: result.applied ? 'REPAIR NANITES // HULL RESTORED' : 'HULL FULL // +500',
        overdrive: 'OVERDRIVE // WEAPONS HOT',
        tractor: 'TRACTOR // WIDE SALVAGE +25%',
        emp: result.applied ? 'EMP CELL // CHARGE ACQUIRED' : result.scoreAwarded ? 'EMP CAPACITY // +500' : 'EMP CAPACITY FULL',
      };
      this.announce(labels[type]);
      if (type === 'emp' && previousEmp === 0 && this.model.empCharges > 0) this.emitRadio('emp-ready');
      this.particles.setParticleTint(type === 'repair' ? 0xff667c : type === 'overdrive' ? 0xffb640 : type === 'tractor' ? 0x65ffb1 : 0x8b7dff);
    } else {
      const result = this.model.upgrade(type as UpgradeType);
      const label = type === 'shield' ? 'AEGIS CAPACITY' : WEAPON_LABELS[type as WeaponType].name.toUpperCase();
      this.announce(result.upgraded ? `${label} // LEVEL ${result.level}` : `${label} MAX // BONUS`);
      if (result.upgraded) {
        const radioByUpgrade: Record<UpgradeType, RadioCue> = {
          spread: 'arc-upgraded', missile: 'nova-upgraded', laser: 'lance-upgraded', drone: 'wing-upgraded', ion: 'ion-upgraded', shield: 'aegis-upgraded',
        };
        this.emitRadio(radioByUpgrade[type as UpgradeType]);
      }
      this.particles.setParticleTint(type === 'shield' ? 0x63a8ff : WEAPON_LABELS[type as WeaponType].color);
    }
    this.emitSound('pickup');
    this.particles.explode(28, this.player.x, this.player.y);
    this.emitState(true);
  }

  private activateEmp(): void {
    if (!this.model.activateEmp()) return;
    const radius = 420;
    const x = this.player.x;
    const y = this.player.y;
    this.enemyBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (bullet.active && Phaser.Math.Distance.Between(x, y, bullet.x, bullet.y) <= radius) this.disableBody(bullet);
      return true;
    });
    const mines: Phaser.Physics.Arcade.Sprite[] = [];
    this.mines.children.each((child) => {
      const mine = child as Phaser.Physics.Arcade.Sprite;
      if (mine.active && Phaser.Math.Distance.Between(x, y, mine.x, mine.y) <= radius) mines.push(mine);
      return true;
    });
    mines.forEach((mine) => this.destroyMine(mine));
    const enemies: Phaser.Physics.Arcade.Sprite[] = [];
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (enemy.active && enemy.getData('combatReady') !== false && Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= radius) enemies.push(enemy);
      return true;
    });
    enemies.forEach((enemy) => {
      const kind = enemy.getData('kind') as EnemyKind;
      if (kind === 'bulwark') enemy.setData('armorDisabledUntil', this.combatNow + 5_000);
      const base = COMMAND_ENEMIES.includes(kind) ? 35 : 12;
      this.damageEnemy(enemy, base * this.model.empDamageMultiplier, 'core', -1, false, true);
    });
    const pulse = this.add.circle(x, y, 28, 0x8b7dff, 0.12).setDepth(7).setStrokeStyle(4, 0xd8d1ff, 0.92);
    this.transientViews.add(pulse);
    this.tweens.add({ targets: pulse, scale: radius / 28, alpha: 0, duration: 440, ease: 'Quad.out', onComplete: () => this.destroyTransient(pulse) });
    if (this.model.modifiers.chronoRelay) {
      const field = this.add.circle(x, y, radius, 0x8b7dff, 0.035).setDepth(2).setStrokeStyle(2, 0xc8bfff, 0.38);
      this.transientViews.add(field);
      this.tweens.add({
        targets: field,
        alpha: { from: 0.14, to: 0.035 },
        scale: { from: 0.96, to: 1.02 },
        duration: 820,
        yoyo: true,
        repeat: 2,
        onComplete: () => this.time.delayedCall(800, () => this.destroyTransient(field)),
      });
    }
    if (this.model.modifiers.temporalEcho) {
      const run = this.missionRun;
      const echoWhenPlaying = (): void => {
        // Scene timers survive pause and mission restart. Keep the earned echo
        // for this run only; never carry its damage into a retry or art preview.
        if (run !== this.missionRun) return;
        if (this.model.mode === 'paused') {
          this.time.delayedCall(150, echoWhenPlaying);
          return;
        }
        if (this.model.mode === 'playing') this.activateTemporalEcho(x, y);
      };
      this.time.delayedCall(2_000, echoWhenPlaying);
    }
    this.cameras.main.shake(250, 0.006);
    this.announce('EMP DISCHARGE');
    this.emitSound('emp');
    this.emitState(true);
  }

  private activateTemporalEcho(x: number, y: number): void {
    const radius = 300;
    this.enemyBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (bullet.active && Phaser.Math.Distance.Between(x, y, bullet.x, bullet.y) <= radius) this.disableBody(bullet);
      return true;
    });
    const mines: Phaser.Physics.Arcade.Sprite[] = [];
    this.mines.children.each((child) => {
      const mine = child as Phaser.Physics.Arcade.Sprite;
      if (mine.active && Phaser.Math.Distance.Between(x, y, mine.x, mine.y) <= radius) mines.push(mine);
      return true;
    });
    mines.forEach((mine) => this.destroyMine(mine));
    const enemies: Phaser.Physics.Arcade.Sprite[] = [];
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (enemy.active && enemy.getData('combatReady') !== false && Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= radius) enemies.push(enemy);
      return true;
    });
    enemies.forEach((enemy) => {
      const kind = enemy.getData('kind') as EnemyKind;
      const base = COMMAND_ENEMIES.includes(kind) ? 18 : 6;
      this.damageEnemy(enemy, base * this.model.empDamageMultiplier, 'core', -1, false, true);
    });
    const pulse = this.add.circle(x, y, 24, 0x65ffb1, 0.1).setDepth(7).setStrokeStyle(3, 0xc8ffe4, 0.82);
    this.transientViews.add(pulse);
    this.tweens.add({ targets: pulse, scale: radius / 24, alpha: 0, duration: 360, ease: 'Quad.out', onComplete: () => this.destroyTransient(pulse) });
    this.announce('TEMPORAL ECHO // SECOND PULSE');
    this.emitSound('emp');
  }

  private damagePlayer(forced = false, source: 'projectile' | 'ram' | 'hazard' = 'projectile'): void {
    this.damageAttempts += 1;
    if (this.godMode && !forced) {
      this.lastDamageResult = 'god-mode';
      return;
    }
    const previousShield = this.model.shield;
    const result = this.model.takeDamage(source);
    this.lastDamageResult = result;
    if (result === 'ignored') return;
    this.emitConsumedDefenses();
    if (result === 'shield' || result === 'reserve') {
      this.playerShield?.hit(this.combatNow);
      this.shieldPulse(0x35e8ff, 1);
      this.emitSound('shield-hit');
      if (this.model.modifiers.repulsorShield) this.clearEnemyBullets(this.player.x, this.player.y, 130);
      if (result === 'reserve') this.announce('AEGIS RESERVE // SHIELD RESTORED');
      if (previousShield > 0 && this.model.shield === 0) this.emitRadio('shield-down');
      else if (result === 'shield' && this.model.shield > 0) this.emitRadio('shield-hit');
    } else {
      this.cameras.main.shake(result === 'destroyed' ? 650 : 260, result === 'destroyed' ? 0.02 : 0.009);
      this.particles.setParticleTint(result === 'phoenix' ? 0xffb640 : 0xff667c);
      this.particles.explode(result === 'destroyed' ? 75 : 25, this.player.x, this.player.y);
      this.emitSound('hull-hit');
      if (result === 'phoenix') this.announce('PHOENIX PROTOCOL // RESTORED');
      if (result === 'secondWind') {
        this.clearEnemyBullets(this.player.x, this.player.y, 160);
        this.announce('SECOND WIND // AEGIS RESTORED');
      }
      if (result === 'nanites') this.announce('EMERGENCY NANITES // HULL STABILIZED');
      if (result === 'fortress') {
        this.clearEnemyBullets(this.player.x, this.player.y, 90);
        this.announce('FORTRESS FRAME // IMPACT DEFLECTED');
      }
      if (this.model.hull === 1 && !this.hullCriticalAnnounced) {
        this.hullCriticalAnnounced = true;
        this.emitRadio('hull-critical');
      }
    }

    this.tweens.killTweensOf(this.player);
    this.tweens.add({ targets: this.player, alpha: { from: 0.22, to: 1 }, duration: 100, repeat: result === 'shield' || result === 'reserve' ? 2 : 6 });
    if (result === 'destroyed') this.endFailedMission();
    this.emitState(true);
  }

  private emitConsumedDefenses(): void {
    event('aegis:defense-consumed', { missionId: this.model.mission.id, game: this.model.exportCheckpoint() });
  }

  private clearEnemyBullets(x: number, y: number, radius: number, playerFeedback = true): void {
    this.enemyBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (bullet.active && Phaser.Math.Distance.Between(x, y, bullet.x, bullet.y) <= radius) this.disableBody(bullet);
      return true;
    });
    if (playerFeedback) this.shieldPulse(0x8b7dff, 1.8);
  }

  private shieldPulse(color: number, scale: number): void {
    const ring = this.add.circle(this.player.x, this.player.y, 32, color, 0.05).setDepth(7).setStrokeStyle(3, color, 0.9);
    this.transientViews.add(ring);
    this.tweens.add({
      targets: ring,
      scale: 2.1 * scale,
      alpha: 0,
      duration: 430,
      ease: 'Quad.out',
      onComplete: () => this.destroyTransient(ring),
    });
  }

  private completeMission(finalVictory: boolean): void {
    if (this.missionEnding || this.model.mode !== 'playing') return;
    const run = this.missionRun;
    finalVictory = finalVictory && this.model.mission.id === 'lastLight';
    this.missionEnding = true;
    this.model.complete(finalVictory);
    this.player.setVelocity(0).setTexture(this.shipTexture('player'), this.dimensional ? NEUTRAL_BANK : undefined).setAngle(0).setScale(1).setAlpha(1);
    (this.player.body as Phaser.Physics.Arcade.Body).enable = false;
    this.fadeCombatForExtraction();
    BattleScene.saveHighScore(this.model.highScore);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 1_600 : finalVictory ? 4_200 : 3_000;
    event('aegis:mission-clear', {
      missionTitle: this.model.mission.title,
      finalVictory,
      durationMs: duration,
    });
    if (!reducedMotion) this.cameras.main.shake(finalVictory ? 720 : 260, finalVictory ? 0.012 : 0.004);
    this.emitSound('victory');
    this.emitState(true);
    const escortDelay = reducedMotion ? 180 : finalVictory ? 1_500 : 520;
    const exitDelay = reducedMotion ? 620 : finalVictory ? 2_050 : 1_100;
    const formation = droneFormation(this.model.weapons.drone, this.model.sortieModule === 'wingman-beacon');
    this.drones.forEach((drone, index) => {
      if (!drone.visible || !formation[index]) return;
      const slot = formation[index];
      this.tweens.add({
        targets: drone,
        x: this.player.x + slot.x * 0.82,
        y: this.player.y + slot.y * 0.55,
        duration: escortDelay,
        ease: 'Sine.out',
      });
    });
    this.time.delayedCall(escortDelay, () => {
      if (run !== this.missionRun) return;
      const surge = this.add.circle(this.player.x, this.player.y + 38, 18, 0x35e8ff, 0.25)
        .setDepth(7)
        .setStrokeStyle(3, 0xfff6cf, 0.9)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.transientViews.add(surge);
      this.tweens.add({ targets: surge, scale: 3.6, alpha: 0, duration: 520, onComplete: () => this.destroyTransient(surge) });
      this.contrails.clear();
      this.contrails.lineStyle(13, 0x35e8ff, 0.12).lineBetween(this.player.x - 17, this.player.y + 34, this.player.x - 17, WORLD_HEIGHT + 180);
      this.contrails.lineBetween(this.player.x + 17, this.player.y + 34, this.player.x + 17, WORLD_HEIGHT + 180);
      this.contrails.lineStyle(3, 0xfff6cf, 0.72).lineBetween(this.player.x - 17, this.player.y + 34, this.player.x - 17, WORLD_HEIGHT + 110);
      this.contrails.lineBetween(this.player.x + 17, this.player.y + 34, this.player.x + 17, WORLD_HEIGHT + 110);
    });
    this.time.delayedCall(exitDelay, () => {
      if (run !== this.missionRun) return;
      const exitDuration = Math.max(420, duration - exitDelay - 180);
      const targets = [this.player, ...this.drones.filter((drone) => drone.visible)];
      this.tweens.add({
        targets,
        y: `-=${WORLD_HEIGHT + 180}`,
        scaleX: 0.72,
        scaleY: 0.72,
        duration: exitDuration,
        ease: reducedMotion ? 'Linear' : 'Cubic.in',
      });
      this.tweens.add({ targets: this.playerShadow, alpha: 0, duration: 240 });
    });
    this.time.delayedCall(duration, () => {
      if (run !== this.missionRun) return;
      this.physics.world.pause();
      event('aegis:mission-ended', this.model.snapshot());
    });
  }

  private fadeCombatForExtraction(): void {
    const fadeGroup = (group: Phaser.Physics.Arcade.Group): void => {
      group.children.each((child) => {
        const object = child as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Alpha & { body?: Phaser.Physics.Arcade.Body };
        if (object.body) object.body.enable = false;
        this.tweens.add({ targets: object, alpha: 0, duration: 350, ease: 'Quad.out' });
        return true;
      });
    };
    [this.playerBullets, this.enemyBullets, this.enemies, this.pickups, this.mines].forEach(fadeGroup);
    this.enemyHitZones.children.each((child) => {
      const zone = child as Phaser.GameObjects.Zone;
      (zone.body as Phaser.Physics.Arcade.Body).enable = false;
      zone.setActive(false);
      return true;
    });
    this.transientViews.forEach((view) => {
      if (view === this.playerShadow || view === this.contrails) return;
      if ('alpha' in view) this.tweens.add({ targets: view, alpha: 0, duration: 350 });
    });
  }

  private endFailedMission(): void {
    if (this.missionEnding) return;
    const run = this.missionRun;
    this.missionEnding = true;
    this.player.setVelocity(0).setVisible(false).setActive(false);
    BattleScene.saveHighScore(this.model.highScore);
    this.physics.world.pause();
    this.announce('AEGIS SIGNAL LOST');
    this.emitSound('defeat');
    this.time.delayedCall(850, () => {
      if (run === this.missionRun) event('aegis:mission-ended', this.model.snapshot());
    });
  }

  private debugCompleteMission(): void {
    if (!this.debugMode || this.model.mode !== 'playing' || this.isolatedCraftPreview) return;
    for (let index = 0; index < 20; index += 1) this.model.registerKill(0, 5);
    if (this.model.mission.id === 'lastLight') {
      this.model.setFinalePhase('boss');
      this.model.advanceFinaleBoss();
    }
    this.completeMission(isFinaleMission(this.model.mission.id));
  }

  private previewEnemy(kind: EnemyKind): void {
    // Art-review only: no campaign encounter cursor, checkpoint or result can
    // be produced by an isolated craft. A normal mission start resets the flag.
    if (!this.debugMode || !isGraphicsPreview(window.location.search) || this.model.mode !== 'playing') return;
    if (!(kind in ENEMIES)) return;
    this.missionRun += 1; // invalidate delayed natural boss/extraction callbacks
    this.isolatedCraftPreview = true;
    this.bossSpawnScheduled = false;
    this.bossSpawned = false;
    this.commandEncounterActive = false;
    this.commandRemaining = 0;
    this.clearBattlefield();
    this.boss = undefined;
    this.model.setBoss('', 0);
    const craft = this.spawnEnemy(kind, WORLD_WIDTH / 2, 110, 0);
    if (craft && COMMAND_ENEMIES.includes(kind)) this.boss = craft;
    this.announce(`ISOLATED CRAFT // ${kind.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()}`);
    this.emitState(true);
  }

  private debugSpawnWarden(): void {
    if (!this.debugMode || this.model.mode !== 'playing') return;
    const warden = this.spawnEnemy('warden', WORLD_WIDTH / 2, 118, 0);
    warden?.setData('attackIndex', 0).setData('nextFire', this.combatNow + 900);
    this.commandEncounterActive = true;
    this.model.setBoss('WARDEN', 1);
  }

  private setPaused(paused: boolean): void {
    if (paused && this.model.mode === 'playing') {
      this.model.setPaused(true);
      this.time.paused = true;
      // Keep the tween manager ticking with zero progression so its wall-clock
      // baseline stays current; pauseAll would accumulate a resume-frame delta.
      this.tweens.timeScale = 0;
      this.physics.world.pause();
      event('aegis:pause-state', true);
    } else if (!paused && this.model.mode === 'paused') {
      this.model.setPaused(false);
      this.time.paused = false;
      this.tweens.timeScale = 1;
      this.physics.world.resume();
      event('aegis:pause-state', false);
    }
    this.emitState(true);
  }

  private emitState(force: boolean): void {
    if (!force) return;
    this.lastHudAt = this.combatNow;
    event('aegis:state', this.model.snapshot());
    if (this.debugMode) {
      const enemies: Array<{ kind: EnemyKind; x: number; y: number; state: string; combatReady: boolean; reactors?: number[];
        turrets?: Array<ReturnType<typeof siegeTurretPose> & { health: number; maxHealth: number }> }> = [];
      this.enemies.children.each((child) => {
        const enemy = child as Phaser.Physics.Arcade.Sprite;
        if (enemy.active) {
          enemies.push({
            kind: enemy.getData('kind') as EnemyKind,
            x: Math.round(enemy.x * 10) / 10,
            y: Math.round(enemy.y * 10) / 10,
            state: enemy.getData('state') as string,
            combatReady: enemy.getData('combatReady') !== false,
            reactors: enemy.getData('kind') === 'bulwark' ? [...(enemy.getData('reactorHealth') as number[])] : undefined,
            turrets: (enemy.getData('modularBoss') as ModularBossState | undefined)?.turrets.map((turret, index) => {
              const pose = siegeTurretPose(index, turret.rotation, enemy.displayWidth, enemy.displayHeight);
              return { ...pose, x: enemy.x + pose.x, y: enemy.y + pose.y,
                muzzles: pose.muzzles.map((muzzle) => ({ x: enemy.x + muzzle.x, y: enemy.y + muzzle.y })),
                health: turret.health, maxHealth: turret.maxHealth };
            }),
          });
        }
        return true;
      });
      const pickups: Array<{ type: PickupType; x: number; y: number; paired: boolean; velocityY: number }> = [];
      this.pickups.children.each((child) => {
        const pickup = child as Phaser.Physics.Arcade.Sprite;
        if (pickup.active) pickups.push({
          type: pickup.getData('pickup') as PickupType,
          x: Math.round(pickup.x * 10) / 10,
          y: Math.round(pickup.y * 10) / 10,
          paired: pickup.getData('pairId') !== undefined,
          velocityY: Math.round((pickup.body as Phaser.Physics.Arcade.Body).velocity.y * 10) / 10,
        });
        return true;
      });
      event('aegis:debug-combat', { enemies, pickups, graphics: {
        style: this.dimensional ? 'dimensional' : 'classic',
        isolatedCraftPreview: this.isolatedCraftPreview,
        godMode: this.godMode, damageAttempts: this.damageAttempts, lastDamageResult: this.lastDamageResult,
        playerTexture: this.player.texture.key, playerFrame: this.player.frame.name,
        playerNativeSize: [this.player.width, this.player.height],
        playerBodySize: [(this.player.body as Phaser.Physics.Arcade.Body).sourceWidth, (this.player.body as Phaser.Physics.Arcade.Body).sourceHeight],
        fps: Math.round(this.game.loop.actualFps),
        environment: this.dimensionalEnvironment?.snapshot() ?? this.classicSpaceEnvironment?.snapshot(),
        enemyFrames: this.enemies.getChildren().filter((child) => child.active).map((child) => {
          const sprite = child as Phaser.Physics.Arcade.Sprite;
          return { kind: sprite.getData('kind'), texture: sprite.texture.key, frame: sprite.frame.name, width: sprite.width, height: sprite.height };
        }),
      } });
    }
  }

  private announce(message: string): void {
    event('aegis:announce', message);
  }

  private emitSound(cue: SoundCue, x?: number): void {
    event('aegis:sound', x === undefined ? cue : { cue, pan: Phaser.Math.Clamp((x / WORLD_WIDTH) * 2 - 1, -1, 1) });
  }

  private emitRadio(cue: RadioCue): void {
    event('aegis:radio', cue);
  }

  private removeEscapedEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    this.destroyEnemyView(enemy, 'modulesView');
    this.destroyEnemyView(enemy, 'telegraph');
    this.destroyEnemyView(enemy, 'aura');
    this.destroyEnemyView(enemy, 'shadow');
    this.destroyEnemyView(enemy, 'arrivalRing');
    this.destroyEnemyView(enemy, 'carrierAura');
    this.destroyEnemyView(enemy, 'analyzer');
    this.clearArtilleryMarkers(enemy);
    this.destroyEnemyHitZones(enemy);
    enemy.destroy();
  }

  private destroyEnemyView(enemy: Phaser.Physics.Arcade.Sprite, key: string): void {
    const view = enemy.getData(key) as Phaser.GameObjects.GameObject | undefined;
    if (view?.active) this.destroyTransient(view);
    enemy.setData(key, undefined);
  }

  private destroyTransient(view: Phaser.GameObjects.GameObject): void {
    this.transientViews.delete(view);
    if (view.active) view.destroy();
  }

  private cleanupDetachedViews(): void {
    this.transientViews.forEach((view) => view.destroy());
    this.transientViews.clear();
  }

  private disableBody(sprite: Phaser.Physics.Arcade.Sprite): void {
    sprite.disableBody(true, true);
  }

  private static loadHighScore(): number {
    try {
      return Number.parseInt(localStorage.getItem('aegis-vector-high-score') ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  private static saveHighScore(score: number): void {
    if (isGraphicsPreview(window.location.search)) return;
    try {
      localStorage.setItem('aegis-vector-high-score', String(score));
    } catch {
      // Private browsing can deny storage; the campaign remains fully playable.
    }
  }
}
