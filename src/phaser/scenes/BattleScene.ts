import Phaser from 'phaser';
import type { RadioCue, SoundCue } from '../../audio/SoundEngine';
import { ASSET_KEYS } from '../../game/assets/manifest';
import {
  DIFFICULTY,
  ENEMIES,
  MAX_ACTIVE_ENEMIES,
  MAX_ACTIVE_MINES,
  MAX_HOSTILE_PROJECTILES,
  WEAPON_LABELS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../game/content/balance';
import {
  carrierKind,
  carrierMilestones,
  EncounterDirector,
  getThreatTuning,
  globalCarrierIndex,
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

const SPECIALISTS: EnemyKind[] = ['charger', 'sniper', 'mineLayer', 'shieldCarrier', 'bulwark', 'phantom', 'artillery', 'reclaimer'];

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
  private playerShadow!: Phaser.GameObjects.Ellipse;
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
  private godMode = false;
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

  private readonly startHandler = (raw: Event): void => {
    this.startMission((raw as CustomEvent<MissionStartConfig>).detail);
  };

  private readonly pauseHandler = (): void => this.setPaused(true);
  private readonly resumeHandler = (): void => this.setPaused(false);
  private readonly empHandler = (): void => this.activateEmp();

  constructor() {
    super('battle');
  }

  create(): void {
    const query = new URLSearchParams(window.location.search);
    this.debugMode = query.get('debug') === '1';
    this.godMode = this.debugMode && query.get('god') === '1';
    this.hitboxDebug = this.debugMode && query.get('collisionDebug') === '1';
    this.graphicsQuality = this.resolveGraphicsQuality();
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
    });

    window.__AEGIS_DEBUG__ = {
      getState: () => this.model.snapshot(),
      damagePlayer: () => this.damagePlayer(true),
      grantPickup: (type) => this.collectPickup(type),
      spawnEnemy: (kind) => { this.spawnEnemy(kind, WORLD_WIDTH / 2, 110, 0); },
      spawnBoss: () => this.spawnBoss(),
      activateEmp: () => this.activateEmp(),
      completeMission: () => this.debugCompleteMission(),
    };

    event('aegis:ready');
    this.emitState(true);
  }

  update(time: number, delta: number): void {
    if (this.model.mode !== 'paused') this.scrollEnvironment(delta);
    if (this.model.mode !== 'playing') return;

    const restoration = this.model.tick(delta);
    if (restoration === 'shield') {
      this.shieldPulse(0x35e8ff, 1.2);
      this.emitSound('shield-ready');
      this.announce('SHIELD ENERGY RESTORED');
      this.emitRadio('shield-restored');
      if (this.model.modifiers.guardianPulse) this.clearEnemyBullets(this.player.x, this.player.y, 90);
    } else if (restoration === 'hull') {
      this.emitSound('pickup');
      this.announce('NANITE LATTICE // HULL RESTORED');
    }
    if (this.model.hull > 1) this.hullCriticalAnnounced = false;

    this.updatePlayer(time, delta);
    this.hitboxGraphics?.clear();
    this.updateDrones(delta);
    this.updateProjectiles(delta);
    this.updateEnemies(time, delta);
    this.updateMines(time, delta);
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
    this.player = this.physics.add.sprite(WORLD_WIDTH / 2, WORLD_HEIGHT - 110, ASSET_KEYS.player)
      .setDepth(6)
      .setVisible(false)
      .setActive(false);
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(28, 42).setOffset(30, 31);

    for (let index = 0; index < 5; index += 1) {
      this.drones.push(this.add.sprite(this.player.x, this.player.y, ASSET_KEYS.drone).setDepth(5).setVisible(false));
    }
  }

  private createInput(): void {
    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable.');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,Z,SPACE') as typeof this.keys;
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X).on('down', () => this.activateEmp());
    let pauseKeyHeld = false;
    const togglePause = (): void => {
      if (pauseKeyHeld) return;
      pauseKeyHeld = true;
      if (this.missionEnding) return;
      if (this.model.mode === 'playing') this.setPaused(true);
      else if (this.model.mode === 'paused') this.setPaused(false);
    };
    const releasePause = (): void => { pauseKeyHeld = false; };
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', togglePause).on('up', releasePause);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P).on('down', togglePause).on('up', releasePause);
    if (this.debugMode) {
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE).on('down', () => this.collectPickup('spread'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO).on('down', () => this.collectPickup('missile'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE).on('down', () => this.collectPickup('laser'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR).on('down', () => this.collectPickup('drone'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE).on('down', () => this.collectPickup('shield'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX).on('down', () => this.collectPickup('emp'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I).on('down', () => this.collectPickup('ion'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.O).on('down', () => this.collectPickup('overdrive'));
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
      if (this.model.modifiers.kineticReversal && this.model.shield > 0) this.reflectHostileBullet(projectile);
      this.disableBody(projectile);
      this.damagePlayer(false, 'projectile');
    });
    this.physics.add.overlap(this.player, this.enemyHitZones, (_player, hitZone) => {
      const zone = hitZone as Phaser.GameObjects.Zone;
      const target = zone.getData('enemy') as Phaser.Physics.Arcade.Sprite;
      if (!target?.active || target.getData('combatReady') === false) return;
      const lastRamAt = (target.getData('lastRamAt') as number | undefined) ?? Number.NEGATIVE_INFINITY;
      if (this.time.now - lastRamAt < 250) return;
      target.setData('lastRamAt', this.time.now);
      this.damagePlayer(false, 'ram');
      const kind = target.getData('kind') as EnemyKind;
      if (!['boss', 'warden', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer'].includes(kind)) this.damageEnemy(target, 8);
    });
    this.physics.add.overlap(this.player, this.mines, (_player, mine) => {
      const target = mine as Phaser.Physics.Arcade.Sprite;
      if (!target.getData('armed')) return;
      this.destroyMine(target);
      this.damagePlayer(false, 'hazard');
    });
    this.physics.add.overlap(this.player, this.pickups, (_player, pickup) => {
      const target = pickup as Phaser.Physics.Arcade.Sprite;
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
    this.model.start(config);
    this.encounterDirector = new EncounterDirector(config.campaignSeed, config.difficulty, config.mission.id);

    const missionTints: Record<string, number> = {
      coastal: 0xffffff,
      minefield: 0xd9f7d9,
      fortress: 0xd6d7ff,
      stormbreak: 0xc8d9ff,
      graveyard: 0xd0ffe9,
      carrierSiege: 0xffe3ba,
      dreadnought: 0xffd5dc,
    };
    const environmentKeys: Record<string, string> = {
      coastal: ASSET_KEYS.coastal,
      minefield: ASSET_KEYS.minefield,
      fortress: ASSET_KEYS.fortress,
      stormbreak: ASSET_KEYS.stormbreak,
      graveyard: ASSET_KEYS.graveyard,
      carrierSiege: ASSET_KEYS.carrierSiege,
      dreadnought: ASSET_KEYS.dreadnought,
    };
    const accentColors: Record<string, number> = {
      coastal: 0x35e8ff,
      minefield: 0x45ff9c,
      fortress: 0x9d7dff,
      stormbreak: 0x67ecff,
      graveyard: 0x65ffb1,
      carrierSiege: 0xffb640,
      dreadnought: 0xff3f56,
    };
    this.ocean.setTint(missionTints[config.mission.id] ?? 0xffffff);
    this.clouds.setTint(missionTints[config.mission.id] ?? 0xffffff);
    this.horizonHaze.setTint(missionTints[config.mission.id] ?? 0xffffff);
    this.midground.setTexture(environmentKeys[config.mission.id] ?? ASSET_KEYS.coastal);
    this.ambientWash.setFillStyle(accentColors[config.mission.id] ?? 0x35e8ff, config.mission.id === 'dreadnought' ? 0.035 : 0.018);
    this.player.setPosition(WORLD_WIDTH / 2, WORLD_HEIGHT - 110).setVisible(true).setActive(true).setAlpha(1);
    this.playerShadow.setVisible(true);
    this.contrails.setVisible(true);
    (this.player.body as Phaser.Physics.Arcade.Body).enable = true;
    this.nextWaveAt = this.time.now + 1_100;
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

    const minY = WORLD_HEIGHT * 0.29;
    if (this.player.y < minY) {
      this.player.y = minY;
      this.player.setVelocityY(Math.max(0, (this.player.body as Phaser.Physics.Arcade.Body).velocity.y));
    }

    this.player.angle = Phaser.Math.Linear(this.player.angle, direction.x * 7, Math.min(1, delta * 0.014));
    const bank = Math.min(0.12, Math.abs(direction.x) * 0.12);
    const bankFrame = direction.x <= -0.7 ? 0 : direction.x < -0.1 ? 1 : direction.x >= 0.7 ? 4 : direction.x > 0.1 ? 3 : 2;
    this.player.setTexture(ASSET_KEYS.playerBanks[bankFrame]);
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
      const angles = spreadLevel === 1
        ? [0]
        : spreadLevel === 2
          ? [-0.09, 0, 0.09]
          : spreadLevel >= 5
            ? [-0.22, -0.145, -0.072, 0, 0.072, 0.145, 0.22]
            : spreadLevel >= 4
              ? [-0.145, -0.072, 0, 0.072, 0.145]
              : [-0.17, -0.08, 0, 0.08, 0.17];
      const arcDamage = spreadLevel >= 4 ? 1.2 : 1;
      angles.forEach((angle) => {
        const prism = this.model.modifiers.prismaticCore && Math.abs(angle) < 0.001 ? 1.5 : 1;
        this.spawnPlayerBullet(this.player.x, this.player.y - 42, ASSET_KEYS.playerBullet, angle, arcDamage * prism * (heliosVolley ? 1.5 : 1), heliosVolley, 'spread');
      });
      if (this.model.modifiers.splitCapacitors) this.spawnPlayerBullet(this.player.x + 8, this.player.y - 40, ASSET_KEYS.playerBullet, 0, heliosVolley ? 1.5 : 1, heliosVolley, 'spread');
      this.weaponMuzzle('spread', this.player.x, this.player.y - 42, heliosVolley || this.model.weaponOverdriveState !== 'inactive');
      const levelFiveRate = spreadLevel >= 5 ? 0.9 : 1;
      this.nextPrimaryAt = time + Math.max(62, (154 - spreadLevel * 12) * intervalScale * levelFiveRate);
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
      const count = (missileLevel >= 4 ? 3 : missileLevel >= 2 ? 2 : 1) + (this.model.modifiers.ordnanceCascade ? 1 : 0);
      for (let index = 0; index < count; index += 1) {
        const offset = (index - (count - 1) / 2) * 27;
        const hunterDamage = this.model.modifiers.hunterLogic ? 1.25 : 1;
        this.spawnPlayerBullet(this.player.x + offset, this.player.y - 18, ASSET_KEYS.missile, offset * 0.0015, (3 + missileLevel) * hunterDamage, false, 'missile');
      }
      this.nextMissileAt = time + Math.max(360, (1_060 - missileLevel * 120) * intervalScale);
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
    const boss = available.find((enemy) => ['boss', 'warden', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer'].includes(enemy.getData('kind') as string));
    const maxTargets = boss ? 1 : Math.min(5, level + (this.model.modifiers.prismaticCore ? 2 : 0));
    const hit: Phaser.Physics.Arcade.Sprite[] = [];
    let originX = this.player.x;
    let originY = this.player.y - 38;
    for (let index = 0; index < maxTargets; index += 1) {
      const target = available
        .filter((enemy) => !hit.includes(enemy))
        .sort((a, b) => Phaser.Math.Distance.Squared(originX, originY, a.x, a.y) - Phaser.Math.Distance.Squared(originX, originY, b.x, b.y))[0];
      if (!target || Phaser.Math.Distance.Between(originX, originY, target.x, target.y) > 430) break;
      this.ionArc(originX, originY, target.x, target.y);
      hit.push(target);
      originX = target.x;
      originY = target.y;
    }
    if (hit.length === 0) return;
    this.model.registerShot();
    const damage = (2.4 + level * 0.8) * (level >= 4 ? 1.25 : 1) * this.model.damageMultiplier;
    hit.forEach((enemy) => {
      this.model.registerHit();
      const weakpoint = this.firstActiveBulwarkReactorZone(enemy);
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
    body.setSize(isLaser && this.model.modifiers.splitCapacitors ? 11 : isWing ? 7 : 8, isLaser ? 48 : isWing ? 16 : 18);
    const missile = texture === ASSET_KEYS.missile;
    bullet.setDataEnabled()
      .setData('damage', baseDamage * this.model.damageMultiplier)
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
      if (bullet.getData('weaponKind') === 'laser' && this.time.now >= ((bullet.getData('nextVisualTrailAt') as number | undefined) ?? 0)) {
        bullet.setData('nextVisualTrailAt', this.time.now + 80);
        const afterimage = this.add.image(bullet.x, bullet.y + 18, bullet.texture.key)
          .setDepth(3)
          .setAlpha(0.18)
          .setScale(bullet.scaleX, bullet.scaleY)
          .setRotation(bullet.rotation)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.transientViews.add(afterimage);
        this.tweens.add({ targets: afterimage, alpha: 0, scaleY: bullet.scaleY * 0.72, duration: 90, onComplete: () => this.destroyTransient(afterimage) });
      }
      if (bullet.getData('overdriveVisual') && this.time.now >= ((bullet.getData('nextTrailAt') as number | undefined) ?? 0)) {
        bullet.setData('nextTrailAt', this.time.now + 70);
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

  private firstActiveBulwarkReactorZone(enemy: Phaser.Physics.Arcade.Sprite): Phaser.GameObjects.Zone | undefined {
    if (enemy.getData('kind') !== 'bulwark') return undefined;
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
      drone.clearTint().setTexture(texture);
      if (slot.variant === 'beacon' && !overdrive) drone.setTint(0x9d8cff);
      const targetX = this.player.x + slot.x;
      const targetY = this.player.y + slot.y + Math.sin(this.time.now * 0.004 + index * Math.PI) * 5;
      drone.x = Phaser.Math.Linear(drone.x, targetX, Math.min(1, delta * 0.012));
      drone.y = Phaser.Math.Linear(drone.y, targetY, Math.min(1, delta * 0.012));
    });
  }

  private updateWaveDirector(time: number): void {
    if (this.model.mission.id === 'dreadnought') {
      this.updateDreadnoughtApproach();
      return;
    }

    const progress = Math.min(1, this.model.stageElapsedMs / this.model.stageDurationMs);
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
      this.completeMission(false);
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
    const approachDuration = 30_000;
    const thresholds = [1_100, 8_000, 15_000, 22_000];
    if (this.finaleApproachWave < thresholds.length && this.model.stageElapsedMs >= thresholds[this.finaleApproachWave]) {
      const wave = this.finaleApproachWave;
      this.finaleApproachWave += 1;
      if (wave === 0) {
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
    this.model.setFinalePhase('boss');
    this.announce('FORTRESS CORE AHEAD');
    this.enemyBullets.clear(true, true);
    this.mines.clear(true, true);
    this.bossSpawnScheduled = true;
    this.time.delayedCall(650, () => {
      this.bossSpawnScheduled = false;
      this.spawnBoss();
    });
  }

  private maybeSpawnMiniboss(progress: number): boolean {
    const definition = minibossForMission(this.model.mission.id);
    if (!definition || this.minibossSpawned || progress < definition.progress) return false;
    if (this.commandEncounterActive) return true;
    const pairedOfferActive = this.pickups.getMatching('active', true)
      .some((pickup) => (pickup as Phaser.Physics.Arcade.Sprite).getData('pairId') !== undefined);
    if (this.enemies.countActive(true) > 0 || pairedOfferActive) {
      this.nextWaveAt = Math.max(this.nextWaveAt, this.time.now + 900);
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
      this.nextWaveAt = Math.max(this.nextWaveAt, this.time.now + 900);
      return true;
    }
    const bulwark = this.spawnEnemy('bulwark', WORLD_WIDTH / 2, -100, 0);
    if (!bulwark) return true;
    this.bulwarkIntroduced = true;
    this.nextWaveAt = this.time.now + 5_400;
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
    this.markCarrier(carrier, globalCarrierIndex(this.model.mission.id, localIndex));
    this.announce('ARMAMENT CORE DETECTED');
    this.emitSound('warning');
  }

  private maybeSpawnCommandTargets(): void {
    if (this.commandSpawned) return;
    const remaining = this.model.stageDurationMs - this.model.stageElapsedMs;
    if (this.model.mission.id === 'coastal' && remaining <= 18_000) {
      this.commandSpawned = true;
      this.commandRemaining = 1;
      this.announce('COMMAND FORMATION INBOUND');
      const leader = this.spawnEnemy('elite', WORLD_WIDTH / 2, -80, 0);
      leader?.setData('commandTarget', true);
      if (leader) this.configureDepthArrival(leader, 1_200);
      this.spawnEnemy('interceptor', 220, -45, 1);
      this.spawnEnemy('interceptor', WORLD_WIDTH - 220, -45, 2);
    } else if (this.model.mission.id === 'minefield' && this.model.stageElapsedMs >= this.model.stageDurationMs * 0.785) {
      this.commandSpawned = true;
      this.commandRemaining = 1;
      this.commandEncounterActive = true;
      this.enemies.clear(true, true);
      this.enemyHitZones.clear(true, true);
      this.enemyBullets.clear(true, true);
      this.cleanupDetachedViews();
      this.announce('WARNING // WARDEN DETECTED');
      this.emitSound('warning');
      const warden = this.spawnEnemy('warden', WORLD_WIDTH / 2, -105, 0);
      warden?.setData('commandTarget', true).setData('attackIndex', 0);
      if (warden) this.markCarrier(warden, globalCarrierIndex('minefield', 3), false);
      this.model.setBoss('WARDEN', 1);
    } else if (this.model.mission.id === 'fortress' && remaining <= 25_000) {
      this.commandSpawned = true;
      this.commandRemaining = 2;
      this.announce('COMMAND-ELITE GAUNTLET');
      const left = this.spawnEnemy('elite', 390, -80, 1);
      const right = this.spawnEnemy('elite', 890, -130, 2);
      left?.setData('commandTarget', true);
      if (left) {
        this.markCarrier(left, globalCarrierIndex('fortress', 4), false);
        this.configureDepthArrival(left, 1_200);
      }
      right?.setData('commandTarget', true);
      if (right) this.configureDepthArrival(right, 1_200);
      this.spawnEnemy('shieldCarrier', WORLD_WIDTH / 2, -180, 0);
    } else if ((this.model.mission.id === 'stormbreak' || this.model.mission.id === 'graveyard') && remaining <= 20_000) {
      this.commandSpawned = true;
      this.commandRemaining = 1;
      this.announce(this.model.mission.id === 'stormbreak' ? 'STORM ACE INBOUND' : 'SALVAGE COMMAND SHIP INBOUND');
      const command = this.spawnEnemy('elite', WORLD_WIDTH / 2, -90, 0);
      command?.setData('commandTarget', true);
      if (command) this.configureDepthArrival(command, 1_200);
      if (this.model.mission.id === 'stormbreak') {
        this.spawnEnemy('phantom', 300, -140, 1);
        this.spawnEnemy('phantom', 980, -140, 2);
      } else this.spawnEnemy('reclaimer', WORLD_WIDTH / 2 + 230, -150, 1);
    } else if (this.model.mission.id === 'carrierSiege' && remaining <= 30_000) {
      this.commandSpawned = true;
      this.commandRemaining = 1;
      this.commandEncounterActive = true;
      this.enemyBullets.clear(true, true);
      this.announce('WARNING // BASTION CARRIER');
      this.emitSound('warning');
      const carrier = this.spawnEnemy('carrierBoss', WORLD_WIDTH / 2, -110, 0);
      carrier?.setData('commandTarget', true).setData('attackIndex', 0);
      this.model.setBoss('BASTION CARRIER', 1);
    }
  }

  private spawnWave(index: number): void {
    const pattern = index % 6;
    const progress = this.model.stageElapsedMs / this.model.stageDurationMs;
    if (pattern === 0) {
      const center = this.waveX(index, 0, 300, 980);
      for (let i = -2; i <= 2; i += 1) this.spawnEnemy('scout', center + i * 78, -40 - Math.abs(i) * 34, i);
      return;
    }
    if (pattern === 1) {
      for (let i = 0; i < 4; i += 1) this.spawnEnemy('interceptor', i % 2 === 0 ? -30 : WORLD_WIDTH + 30, 65 + i * 78, i);
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
    if (index % 3 === 0 && progress > 0.25) {
      this.spawnEnemy('elite', this.waveX(index, 7, 320, 960), -70, index);
      this.announce('ELITE SIGNAL DETECTED');
    } else {
      this.spawnEnemy('bomber', this.waveX(index, 8, 250, 1030), -60, index);
      for (let i = 0; i < 3; i += 1) this.spawnEnemy('scout', 270 + i * 370, -130 - i * 28, i);
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, phase: number): Phaser.Physics.Arcade.Sprite | undefined {
    if (this.enemies.countActive(true) >= MAX_ACTIVE_ENEMIES) return undefined;
    if (kind === 'bulwark' && this.countActiveEnemies('bulwark') >= 1) return undefined;
    if ((kind === 'artillery' || kind === 'reclaimer' || kind === 'carrierBoss' || kind === 'razorwing' || kind === 'gatekeeper' || kind === 'pursuer') && this.countActiveEnemies(kind) >= 1) return undefined;
    if (kind === 'phantom' && this.countActiveEnemies(kind) >= 2) return undefined;
    const key = ASSET_KEYS[kind];
    const enemy = this.physics.add.sprite(x, y, key).setDepth(3);
    this.enemies.add(enemy);
    const config = ENEMIES[kind];
    const progress = Math.min(1, this.model.stageElapsedMs / Math.max(1, this.model.stageDurationMs));
    const threat = getThreatTuning(progress, this.model.difficulty, this.model.mission.id);
    const health = Math.max(1, Math.round(config.health * threat.enemyHealth));
    enemy.setDataEnabled()
      .setData('entityId', ++this.entityId)
      .setData('kind', kind)
      .setData('health', health)
      .setData('maxHealth', health)
      .setData('originX', x)
      .setData('motionOriginX', x)
      .setData('phase', phase)
      .setData('spawnedAt', this.time.now)
      .setData('motionStartedAt', this.time.now)
      .setData('state', 'entry')
      .setData('combatReady', true)
      .setData('speedScale', threat.movementSpeed)
      .setData('fireScale', threat.fireRate)
      .setData('chronoScale', 1)
      .setData('nextFire', this.time.now + Phaser.Math.Between(900, 2_100));
    if (kind === 'bulwark') {
      enemy.setData('reactorHealth', [7, 7])
        .setData('armorBroken', false)
        .setData('armorDisabledUntil', 0)
        .setData('attackIndex', 0);
    }
    if (kind === 'carrierBoss') enemy.setData('turretHealth', [30, 30]).setData('attackIndex', 0);
    if (kind === 'gatekeeper') enemy.setData('turretHealth', [18, 18]).setData('attackIndex', 0);
    if (kind === 'reclaimer') enemy.setData('cargo', undefined);
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    const commandBody = ['boss', 'warden', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer'].includes(kind);
    body.setSize(enemy.width * (commandBody ? 0.78 : 0.58), enemy.height * 0.52);
    this.createEnemyHitZones(enemy);

    if (kind === 'interceptor') {
      const fromLeft = x < 0;
      enemy.setVelocity((fromLeft ? 230 : -230) * threat.movementSpeed, config.speed * 0.7 * threat.movementSpeed);
      enemy.setAngle(fromLeft ? -24 : 24);
    } else enemy.setVelocityY(config.speed * threat.movementSpeed);

    const shadow = this.add.ellipse(x + 10, y + 34, enemy.width * 0.55, enemy.height * 0.2, 0x02050b, 0.34).setDepth(1);
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
    if (['charger', 'mineLayer', 'shieldCarrier', 'bulwark', 'phantom', 'artillery', 'reclaimer', 'razorwing', 'gatekeeper', 'pursuer', 'carrierBoss', 'warden', 'boss'].includes(kind)) {
      const duration = kind === 'boss' ? 1_800
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
    if (kind === 'boss' || kind === 'warden' || kind === 'razorwing' || kind === 'pursuer' || kind === 'elite' || kind === 'bomber') return LARGE_HITBOXES;
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
    const zones = (enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined) ?? [];
    zones.forEach((zone) => {
      const body = zone.body as Phaser.Physics.Arcade.Body;
      body.enable = enabled && zone.getData('reactorDestroyed') !== true;
      zone.setActive(body.enable);
    });
  }

  private syncEnemyHitZones(enemy: Phaser.Physics.Arcade.Sprite): void {
    const zones = (enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined) ?? [];
    const ready = enemy.getData('combatReady') !== false;
    zones.forEach((zone) => {
      if (!zone.active && zone.getData('reactorDestroyed') === true) return;
      const definition = zone.getData('definition') as EnemyHitboxRect;
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
      body.enable = ready && zone.getData('reactorDestroyed') !== true;
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
      else if (kind === 'reclaimer') this.updateReclaimer(enemy, time);
      else this.updateStandardEnemy(enemy, kind, time);

      const chronoScale = this.model.chronoScale;
      if (chronoScale !== 1) body.velocity.scale(chronoScale);
      enemy.setData('chronoScale', chronoScale);

      this.updateEnemyPresentation(enemy);

      if (enemy.active && (enemy.y > WORLD_HEIGHT + 110 || enemy.x < -160 || enemy.x > WORLD_WIDTH + 160)) this.removeEscapedEnemy(enemy);
      return true;
    });
  }

  private configureDepthArrival(enemy: Phaser.Physics.Arcade.Sprite, duration: number): void {
    const kind = enemy.getData('kind') as EnemyKind;
    const command = ['warden', 'boss', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer'].includes(kind);
    const targetY = kind === 'boss' || kind === 'carrierBoss' ? 128 : kind === 'warden' || kind === 'gatekeeper' || kind === 'pursuer' ? 125 : 115;
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    this.setEnemyHitZonesEnabled(enemy, false);
    enemy.setData('combatReady', false)
      .setData('arrivalElapsed', -600)
      .setData('arrivalDuration', duration)
      .setData('arrivalTargetY', targetY)
      .setPosition(enemy.x, targetY + (command ? 190 : 145))
      .setScale(command ? 0.45 : 0.35)
      .setAlpha(0)
      .setVelocity(0, 0);
    const ring = this.add.ellipse(enemy.x, targetY + 48, enemy.width * 0.65, enemy.height * 0.25, 0x35e8ff, 0.04)
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
    const command = ['warden', 'boss', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer'].includes(kind);
    const offset = command ? 190 : 145;
    enemy.setData('arrivalElapsed', elapsed)
      .setScale(Phaser.Math.Linear(command ? 0.45 : 0.35, 1, progress))
      .setAlpha(elapsed < 0 ? 0 : Phaser.Math.Linear(0.1, 1, progress))
      .setY(Phaser.Math.Linear(targetY + offset, targetY, progress));
    const ring = enemy.getData('arrivalRing') as Phaser.GameObjects.Ellipse | undefined;
    if (ring?.active) {
      const warningPulse = elapsed < 0 ? 0.62 + Math.sin(this.time.now * 0.012) * 0.25 : 0.7 - progress * 0.45;
      ring.setPosition(enemy.x, targetY + 48).setScale(elapsed < 0 ? 1 : 1 - progress * 0.45).setAlpha(warningPulse);
    }
    this.updateEnemyPresentation(enemy);
    if (elapsed < duration) return;
    if (elapsed < duration + 120) {
      enemy.setAlpha(0.72 + Math.sin(elapsed * 0.12) * 0.28);
      return;
    }
    this.destroyEnemyView(enemy, 'arrivalRing');
    enemy.setScale(1).setAlpha(1).setY(targetY)
      .setData('combatReady', true)
      .setData('motionStartedAt', this.time.now)
      .setData('motionOriginX', enemy.x)
      .setData('nextFire', this.time.now + 450);
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setSize(enemy.width * (command ? 0.78 : 0.58), enemy.height * 0.52);
    enemy.setVelocityY(ENEMIES[kind].speed * (enemy.getData('speedScale') as number));
    this.setEnemyHitZonesEnabled(enemy, true);
    this.particles.setParticleTint(command ? 0xf06cff : 0x35e8ff);
    this.particles.explode(command ? 28 : 16, enemy.x, enemy.y);
  }

  private updateEnemyPresentation(enemy: Phaser.Physics.Arcade.Sprite): void {
    if (enemy.getData('combatReady') !== false) {
      const kind = enemy.getData('kind') as EnemyKind;
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      if (['scout', 'interceptor', 'bomber', 'elite', 'razorwing', 'gatekeeper', 'pursuer'].includes(kind)) {
        const baseKey = ASSET_KEYS[kind];
        enemy.setTexture(body.velocity.x < -35 ? `${baseKey}-bank-left` : body.velocity.x > 35 ? `${baseKey}-bank-right` : baseKey);
      }
      if (!['charger', 'interceptor', 'boss', 'warden', 'razorwing'].includes(kind)) {
        const bankAngle = Phaser.Math.Clamp(body.velocity.x * 0.035, -10, 10);
        enemy.angle = Phaser.Math.Linear(enemy.angle, bankAngle, 0.12);
        enemy.setScale(1 - Math.min(0.1, Math.abs(body.velocity.x) / 2_200), 1);
      }
    }
    const shadow = enemy.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
    if (shadow?.active) shadow.setPosition(enemy.x + 12, enemy.y + 36).setScale(Math.max(0.45, enemy.scaleX)).setAlpha(0.2 + enemy.alpha * 0.25);
    const aura = enemy.getData('aura') as Phaser.GameObjects.Arc | undefined;
    if (aura?.active) aura.setPosition(enemy.x, enemy.y);
    const carrierAura = enemy.getData('carrierAura') as Phaser.GameObjects.Arc | undefined;
    if (carrierAura?.active) carrierAura.setPosition(enemy.x, enemy.y).setRotation(this.time.now * 0.001);
    this.syncEnemyHitZones(enemy);
    const analyzer = enemy.getData('analyzer') as Phaser.GameObjects.Graphics | undefined;
    if (analyzer?.active) {
      analyzer.clear().lineStyle(2, 0x65ffb1, 0.68);
      const zones = (enemy.getData('hitZones') as Phaser.GameObjects.Zone[] | undefined) ?? [];
      zones.filter((zone) => zone.active && zone.getData('role') === 'weakpoint').forEach((zone) => {
        analyzer.strokeCircle(zone.x, zone.y, Math.max(8, zone.width * 0.58));
      });
    }
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
    const aliveMs = time - (enemy.getData('motionStartedAt') as number);
    const phase = enemy.getData('phase') as number;
    const originX = enemy.getData('motionOriginX') as number;
    if (kind === 'scout') enemy.x = originX + Math.sin(aliveMs * 0.0024 + phase) * 54;
    if (kind === 'bomber' && enemy.y > 135) {
      enemy.setVelocityY(36 * (enemy.getData('speedScale') as number));
      enemy.x = originX + Math.sin(aliveMs * 0.0012) * 135;
    }
    if (kind === 'elite' && enemy.y > 125) {
      enemy.setVelocityY(22 * (enemy.getData('speedScale') as number));
      enemy.x = originX + Math.sin(aliveMs * 0.0017) * 230;
    }
    if (enemy.y > 45 && enemy.y < 470 && time >= (enemy.getData('nextFire') as number)) {
      this.enemyFire(enemy, kind);
      const base = ENEMIES[kind].fireMs / (DIFFICULTY[this.model.difficulty].enemyFireRate * (enemy.getData('fireScale') as number));
      enemy.setData('nextFire', time + base * Phaser.Math.FloatBetween(0.82, 1.24));
    }
  }

  private updateCharger(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    const state = enemy.getData('state') as string;
    if (state === 'entry' && enemy.y >= 115) {
      enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextSpecial', time + 700);
      return;
    }
    if (state === 'hover') {
      enemy.x = (enemy.getData('originX') as number) + Math.sin(time * 0.002) * 42;
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
      enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', time + 1_300);
      return;
    }
    if (state === 'hover') {
      const motionTime = time - (enemy.getData('motionStartedAt') as number);
      enemy.x = (enemy.getData('motionOriginX') as number) + Math.sin(motionTime * 0.0012) * 90;
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
    enemy.setVelocityY(18 * (enemy.getData('speedScale') as number));
    enemy.x = (enemy.getData('motionOriginX') as number) + Math.sin((time - (enemy.getData('motionStartedAt') as number)) * 0.0011) * 430;
    if (time >= (enemy.getData('nextFire') as number)) {
      this.spawnMine(enemy.x, enemy.y + 32);
      const interval = ENEMIES.mineLayer.fireMs / (DIFFICULTY[this.model.difficulty].enemyFireRate * (enemy.getData('fireScale') as number));
      enemy.setData('nextFire', time + interval);
    }
  }

  private updateShieldCarrier(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    if (enemy.y > 125) {
      enemy.setVelocityY(18 * (enemy.getData('speedScale') as number));
      enemy.x = (enemy.getData('motionOriginX') as number) + Math.sin((time - (enemy.getData('motionStartedAt') as number)) * 0.0014) * 180;
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
    const speedScale = enemy.getData('speedScale') as number;
    if (state === 'entry') {
      enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', Math.max(time + 450, enemy.getData('nextFire') as number));
      return;
    }
    const motionTime = time - (enemy.getData('motionStartedAt') as number);
    enemy.x = (enemy.getData('motionOriginX') as number) + Math.sin(motionTime * 0.00105) * 95;
    enemy.setVelocityY(12 * speedScale);
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
      this.time.delayedCall(140, () => {
        if (enemy.active) fireWing(firstLeft ? rightX : leftX, firstLeft ? 62 : -62);
      });
      enemy.setData('attackIndex', attackIndex + 1)
        .setData('state', 'hover')
        .setData('nextFire', time + ENEMIES.bulwark.fireMs / (DIFFICULTY[this.model.difficulty].enemyFireRate * (enemy.getData('fireScale') as number)));
      this.emitSound('enemy-fire');
    }
  }

  private updatePhantom(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    const state = enemy.getData('state') as string;
    const speedScale = enemy.getData('speedScale') as number;
    if (state === 'entry') {
      enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', Math.max(time + 650, enemy.getData('nextFire') as number));
      return;
    }
    const motionTime = time - (enemy.getData('motionStartedAt') as number);
    enemy.x = (enemy.getData('motionOriginX') as number) + Math.sin(motionTime * 0.0017) * 190;
    enemy.setVelocityY(15 * speedScale);
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
    const motionTime = time - (enemy.getData('motionStartedAt') as number);
    enemy.x = (enemy.getData('motionOriginX') as number) + Math.sin(motionTime * 0.00085) * 115;
    enemy.setVelocityY(9 * (enemy.getData('speedScale') as number));
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

  private updateReclaimer(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
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
      this.physics.moveToObject(enemy, target, ENEMIES.reclaimer.speed * (enemy.getData('speedScale') as number));
      if (nearest <= 34) {
        const cargo = target.getData('pickup') as PickupType;
        enemy.setData('cargo', cargo).setTint(0x65ffb1);
        target.destroy();
        this.announce('RECLAIMER STOLE A UTILITY');
      }
      return;
    }
    const motionTime = time - (enemy.getData('motionStartedAt') as number);
    enemy.x = (enemy.getData('motionOriginX') as number) + Math.sin(motionTime * 0.00125) * 155;
    enemy.setVelocityY(24 * (enemy.getData('speedScale') as number));
  }

  private updateCarrierBoss(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    if ((enemy.getData('state') as string) === 'entry') enemy.setVelocity(0, 0).setData('state', 'hover').setData('nextFire', Math.max(time + 700, enemy.getData('nextFire') as number));
    const motionTime = time - (enemy.getData('motionStartedAt') as number);
    enemy.x = (enemy.getData('motionOriginX') as number) + Math.sin(motionTime * 0.00072) * 235;
    enemy.setVelocityY(0);
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
    if (warden.y < 125) {
      warden.setVelocityY(50);
      return;
    }
    warden.setVelocityY(0);
    const aliveMs = time - (warden.getData('motionStartedAt') as number);
    warden.x = (warden.getData('motionOriginX') as number) + Math.sin(aliveMs * 0.0009) * 280;
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
      enemy.setVelocityY(-300);
      if (enemy.y <= 125) enemy.setY(125).setVelocity(0, 0).setAngle(0).setData('state', 'hover').setData('nextFire', time + 900);
      return;
    }
    if (state === 'dive') {
      if (time >= (enemy.getData('diveEndsAt') as number) || enemy.y >= 510) enemy.setData('state', 'recover').setVelocityY(-300);
      return;
    }
    const motionTime = time - (enemy.getData('motionStartedAt') as number);
    enemy.setVelocityY(0);
    enemy.x = Phaser.Math.Clamp((enemy.getData('motionOriginX') as number) + Math.sin(motionTime * 0.0018) * 360, 120, WORLD_WIDTH - 120);
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
        this.physics.velocityFromRotation(aim, 610, (enemy.body as Phaser.Physics.Arcade.Body).velocity);
        enemy.setRotation(aim + Math.PI / 2).setData('state', 'dive').setData('diveEndsAt', time + 900);
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
    const motionTime = time - (enemy.getData('motionStartedAt') as number);
    enemy.setVelocityY(0);
    enemy.x = (enemy.getData('motionOriginX') as number) + Math.sin(motionTime * 0.00072) * 120;
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
    enemy.setVelocityY(0);
    enemy.x = Phaser.Math.Clamp((enemy.getData('motionOriginX') as number) + Math.sin(motionTime * 0.0009) * 250, 150, WORLD_WIDTH - 150);
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

  private enemyFire(enemy: Phaser.Physics.Arcade.Sprite, kind: EnemyKind): void {
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    if (kind === 'bomber') [-0.22, 0, 0.22].forEach((offset) => this.spawnEnemyBullet(enemy.x, enemy.y + 25, angle + offset, false));
    else if (kind === 'elite') [-0.3, -0.15, 0, 0.15, 0.3].forEach((offset) => this.spawnEnemyBullet(enemy.x, enemy.y + 28, angle + offset, true));
    else this.spawnEnemyBullet(enemy.x, enemy.y + 18, angle, false);
    this.emitSound('enemy-fire');
  }

  private spawnEnemyBullet(x: number, y: number, angle: number, heavy: boolean): void {
    if (this.enemyBullets.countActive(true) >= MAX_HOSTILE_PROJECTILES) return;
    const key = heavy ? ASSET_KEYS.enemyBulletHeavy : ASSET_KEYS.enemyBullet;
    const bullet = this.enemyBullets.get(x, y, key) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;
    bullet.setTexture(key).setPosition(x, y).setActive(true).setVisible(true).setDepth(4);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setCircle(heavy ? 8 : 5, heavy ? 8 : 6, heavy ? 8 : 6);
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
      .setData('armedAt', this.time.now + 750)
      .setData('expiresAt', this.time.now + 6_000)
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

  private spawnBoss(): void {
    if (this.bossSpawned || this.model.mode !== 'playing') return;
    this.bossSpawned = true;
    this.model.setFinalePhase('boss');
    this.enemies.clear(true, true);
    this.enemyHitZones.clear(true, true);
    this.enemyBullets.clear(true, true);
    this.mines.clear(true, true);
    this.cleanupDetachedViews();
    this.model.restoreShield();
    this.shieldPulse(0x35e8ff, 1.25);
    this.announce('WARNING // DREADNOUGHT');
    this.emitSound('warning');
    event('aegis:music', 'boss');
    this.cameras.main.shake(550, 0.006);
    this.boss = this.spawnEnemy('boss', WORLD_WIDTH / 2, -100, 0);
    this.boss?.setData('attackIndex', 0);
    this.model.setBoss('DREADNOUGHT', 1);
  }

  private updateBoss(boss: Phaser.Physics.Arcade.Sprite, time: number): void {
    if (boss.y < 128) {
      boss.setVelocityY(54);
      return;
    }
    boss.setVelocityY(0);
    const aliveMs = time - (boss.getData('motionStartedAt') as number);
    boss.x = (boss.getData('motionOriginX') as number) + Math.sin(aliveMs * 0.00075) * 320;
    const healthRatio = (boss.getData('health') as number) / (boss.getData('maxHealth') as number);
    this.model.setBoss('DREADNOUGHT', healthRatio);
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
    const impactX = enemy.x;
    const impactY = enemy.y;
    const pierce = bullet.getData('pierce') as number;
    if (pierce > 0) bullet.setData('pierce', pierce - 1);
    else this.disableBody(bullet);
    const overdriveVisual = Boolean(bullet.getData('overdriveVisual'));
    this.damageEnemy(enemy, damage, zone.getData('role') as EnemyHitZoneRole, zone.getData('zoneIndex') as number, overdriveVisual);
    const missileLevel = this.model.weapons.missile;
    const splashRadius = this.model.modifiers.phaseArsenal ? 90 : missileLevel >= 5 ? 55 : 0;
    if (missile && splashRadius > 0) {
      this.applyMissileSplash(impactX, impactY, targetId, damage * 0.55, splashRadius, overdriveVisual);
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
    targets.forEach((enemy) => this.damageEnemy(enemy, damage, 'core', -1, overdriveVisual));
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
      if (enemy.active && !['boss', 'warden', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer', 'bulwark'].includes(kind) && Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= radius) {
        this.physics.moveTo(enemy, x, y, 120);
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
  ): void {
    if (!enemy.active || enemy.getData('combatReady') === false) return;
    const kind = enemy.getData('kind') as EnemyKind;
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
      enemy.setData('state', 'hover').setData('nextFire', this.time.now + 1_600);
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
    const protectedByCarrier = !['shieldCarrier', 'boss', 'warden', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer'].includes(kind) && this.isProtectedByCarrier(enemy);
    const bulwarkArmor = kind === 'bulwark'
      && !enemy.getData('armorBroken')
      && this.time.now >= ((enemy.getData('armorDisabledUntil') as number | undefined) ?? 0)
      && role === 'core';
    const damage = rawDamage * (protectedByCarrier ? 0.3 : 1) * (bulwarkArmor ? 0.45 : 1);
    const health = (enemy.getData('health') as number) - damage;
    enemy.setData('health', health);
    enemy.setTintFill(protectedByCarrier ? 0x8b7dff : 0xffffff);
    this.time.delayedCall(45, () => enemy.active && enemy.clearTint());
    this.particles.setParticleTint(overdriveVisual ? OVERDRIVE_GOLD : protectedByCarrier ? 0x8b7dff : ['elite', 'warden', 'pursuer'].includes(kind) ? 0xf06cff : 0xff6f61);
    this.particles.explode(3, enemy.x, enemy.y);
    if (health <= 0) this.destroyEnemy(enemy);
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
    this.clearArtilleryMarkers(enemy);
    this.destroyEnemyHitZones(enemy);
    enemy.destroy();
    const commandExplosion = ['warden', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer'].includes(kind);
    this.particles.setParticleTint(kind === 'boss' ? 0xffb640 : commandExplosion ? 0xf06cff : 0xff6f61);
    this.particles.explode(kind === 'boss' ? 90 : commandExplosion ? 58 : Math.min(28, 8 + maxHealth), x, y);
    this.emitSound('explode');

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
      this.nextWaveAt = this.time.now + 2_000;
      this.announce(`${kind === 'razorwing' ? 'RAZORWING ACE' : kind === 'gatekeeper' ? 'GATEKEEPER FRIGATE' : 'CROWN PURSUER'} DESTROYED`);
    }
    if (kind === 'boss') {
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
    );
    if (isUtilityPickup(type)) this.lastUtility = type;
    const pickup = this.physics.add.sprite(x, y, `${ASSET_KEYS.pickupPrefix}${type}`).setDepth(5);
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
    offer.options.forEach((type, index) => {
      const pickup = this.physics.add.sprite(x + (index === 0 ? -42 : 42), y, `${ASSET_KEYS.pickupPrefix}${type}`).setDepth(6);
      this.pickups.add(pickup);
      pickup.setDataEnabled()
        .setData('pickup', type)
        .setData('pairId', pairId)
        .setData('expiresAt', this.time.now + offer.expiresAfterMs)
        .setVelocity(index === 0 ? -16 : 16, 45)
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
      if (expiresAt !== undefined && this.time.now >= expiresAt) {
        pickup.destroy();
        return true;
      }
      const distance = Phaser.Math.Distance.Between(pickup.x, pickup.y, this.player.x, this.player.y);
      const tractorEligible = canTractorPickup(pickup.getData('pairId') as number | undefined);
      if (tractorEligible && tractorRadius > 0 && distance <= tractorRadius) this.physics.moveToObject(pickup, this.player, 380);
      else if (tractorEligible) pickup.setVelocity(0, 92);
      else pickup.setVelocity(0, 0);
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
        tractor: 'TRACTOR FIELD // ONLINE',
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
      if (kind === 'bulwark') enemy.setData('armorDisabledUntil', this.time.now + 5_000);
      const base = ['boss', 'warden', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer'].includes(kind) ? 35 : 12;
      this.damageEnemy(enemy, base * this.model.empDamageMultiplier);
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
      this.time.delayedCall(2_000, () => {
        if (this.model.mode === 'playing') this.activateTemporalEcho(x, y);
      });
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
      const base = ['boss', 'warden', 'carrierBoss', 'razorwing', 'gatekeeper', 'pursuer'].includes(kind) ? 18 : 6;
      this.damageEnemy(enemy, base * this.model.empDamageMultiplier);
    });
    const pulse = this.add.circle(x, y, 24, 0x65ffb1, 0.1).setDepth(7).setStrokeStyle(3, 0xc8ffe4, 0.82);
    this.transientViews.add(pulse);
    this.tweens.add({ targets: pulse, scale: radius / 24, alpha: 0, duration: 360, ease: 'Quad.out', onComplete: () => this.destroyTransient(pulse) });
    this.announce('TEMPORAL ECHO // SECOND PULSE');
    this.emitSound('emp');
  }

  private damagePlayer(forced = false, source: 'projectile' | 'ram' | 'hazard' = 'projectile'): void {
    if (this.godMode && !forced) return;
    const previousShield = this.model.shield;
    const result = this.model.takeDamage(source);
    if (result === 'ignored') return;
    if (result === 'shield' || result === 'reserve') {
      this.shieldPulse(0x35e8ff, 1);
      this.emitSound('shield-hit');
      if (this.model.modifiers.repulsorShield) this.clearEnemyBullets(this.player.x, this.player.y, 130);
      if (result === 'reserve') this.announce('AEGIS RESERVE // SHIELD RESTORED');
      if (previousShield > 0 && this.model.shield === 0) this.emitRadio('shield-down');
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

  private clearEnemyBullets(x: number, y: number, radius: number): void {
    this.enemyBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (bullet.active && Phaser.Math.Distance.Between(x, y, bullet.x, bullet.y) <= radius) this.disableBody(bullet);
      return true;
    });
    this.shieldPulse(0x8b7dff, 1.8);
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
    this.missionEnding = true;
    this.model.complete(finalVictory);
    this.player.setVelocity(0).setTexture(ASSET_KEYS.player).setAngle(0).setScale(1).setAlpha(1);
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
    this.missionEnding = true;
    this.player.setVelocity(0).setVisible(false).setActive(false);
    BattleScene.saveHighScore(this.model.highScore);
    this.physics.world.pause();
    this.announce('AEGIS SIGNAL LOST');
    this.emitSound('defeat');
    this.time.delayedCall(850, () => event('aegis:mission-ended', this.model.snapshot()));
  }

  private debugCompleteMission(): void {
    if (!this.debugMode || this.model.mode !== 'playing') return;
    for (let index = 0; index < 20; index += 1) this.model.registerKill(0, 5);
    this.completeMission(this.model.mission.id === 'dreadnought');
  }

  private debugSpawnWarden(): void {
    if (!this.debugMode || this.model.mode !== 'playing') return;
    const warden = this.spawnEnemy('warden', WORLD_WIDTH / 2, 118, 0);
    warden?.setData('attackIndex', 0).setData('nextFire', this.time.now + 900);
    this.commandEncounterActive = true;
    this.model.setBoss('WARDEN', 1);
  }

  private setPaused(paused: boolean): void {
    if (paused && this.model.mode === 'playing') {
      this.model.setPaused(true);
      this.physics.world.pause();
      event('aegis:pause-state', true);
    } else if (!paused && this.model.mode === 'paused') {
      this.model.setPaused(false);
      this.physics.world.resume();
      event('aegis:pause-state', false);
    }
    this.emitState(true);
  }

  private emitState(force: boolean): void {
    if (!force) return;
    this.lastHudAt = this.time.now;
    event('aegis:state', this.model.snapshot());
    if (this.debugMode) {
      const enemies: Array<{ kind: EnemyKind; combatReady: boolean; reactors?: number[] }> = [];
      this.enemies.children.each((child) => {
        const enemy = child as Phaser.Physics.Arcade.Sprite;
        if (enemy.active) {
          enemies.push({
            kind: enemy.getData('kind') as EnemyKind,
            combatReady: enemy.getData('combatReady') !== false,
            reactors: enemy.getData('kind') === 'bulwark' ? [...(enemy.getData('reactorHealth') as number[])] : undefined,
          });
        }
        return true;
      });
      event('aegis:debug-combat', enemies);
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
    try {
      localStorage.setItem('aegis-vector-high-score', String(score));
    } catch {
      // Private browsing can deny storage; the campaign remains fully playable.
    }
  }
}
