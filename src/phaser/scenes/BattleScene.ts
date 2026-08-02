import Phaser from 'phaser';
import type { SoundCue } from '../../audio/SoundEngine';
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
  chooseArmamentOffer,
  chooseUtilityPickup,
  isUtilityPickup,
  shouldDropUtility,
} from '../../game/content/pickups';
import { GameModel } from '../../game/simulation/GameModel';
import type {
  EnemyKind,
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

const SPECIALISTS: EnemyKind[] = ['charger', 'sniper', 'mineLayer', 'shieldCarrier'];

export class BattleScene extends Phaser.Scene {
  private model = new GameModel(BattleScene.loadHighScore());
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
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
  private waveIndex = 0;
  private lastHudAt = 0;
  private entityId = 0;
  private debugSpecialistIndex = 0;
  private commandSpawned = false;
  private commandRemaining = 0;
  private wardenActive = false;
  private boss?: Phaser.Physics.Arcade.Sprite;
  private bossSpawned = false;
  private missionEnding = false;
  private debugMode = false;
  private nextCarrierIndex = 0;
  private killsSinceUtilityDrop = 0;
  private offerId = 0;
  private lastThreatLevel = 1;
  private encounterDirector?: EncounterDirector;
  private graphicsQuality: GraphicsQuality = 'auto';

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
    this.debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
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

    if (this.model.tick(delta)) {
      this.shieldPulse(0x35e8ff, 1.2);
      this.emitSound('shield-ready');
      this.announce('SHIELD RESTORED');
    }

    this.updatePlayer(time, delta);
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
    this.pickups = this.physics.add.group({ runChildUpdate: false });
    this.mines = this.physics.add.group({ maxSize: MAX_ACTIVE_MINES, runChildUpdate: false });
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

    for (let index = 0; index < 4; index += 1) {
      this.drones.push(this.add.sprite(this.player.x, this.player.y, ASSET_KEYS.drone).setDepth(5).setVisible(false));
    }
  }

  private createInput(): void {
    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable.');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,Z,SPACE') as typeof this.keys;
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X).on('down', () => this.activateEmp());
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
      if (this.model.mode === 'playing') this.setPaused(true);
      else if (this.model.mode === 'paused') this.setPaused(false);
    });
    if (this.debugMode) {
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE).on('down', () => this.collectPickup('spread'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO).on('down', () => this.collectPickup('missile'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE).on('down', () => this.collectPickup('laser'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR).on('down', () => this.collectPickup('drone'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE).on('down', () => this.collectPickup('shield'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX).on('down', () => this.collectPickup('emp'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I).on('down', () => this.collectPickup('ion'));
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
    this.physics.add.overlap(this.playerBullets, this.enemies, (bullet, enemy) => {
      this.hitEnemy(bullet as Phaser.Physics.Arcade.Sprite, enemy as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.playerBullets, this.mines, (bullet, mine) => {
      this.hitMine(bullet as Phaser.Physics.Arcade.Sprite, mine as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.player, this.enemyBullets, (_player, bullet) => {
      const projectile = bullet as Phaser.Physics.Arcade.Sprite;
      if (this.model.modifiers.kineticReversal && this.model.shield > 0) this.reflectHostileBullet(projectile);
      this.disableBody(projectile);
      this.damagePlayer();
    });
    this.physics.add.overlap(this.player, this.enemies, (_player, enemy) => {
      const target = enemy as Phaser.Physics.Arcade.Sprite;
      this.damagePlayer();
      const kind = target.getData('kind') as EnemyKind;
      if (kind !== 'boss' && kind !== 'warden') this.damageEnemy(target, 8);
    });
    this.physics.add.overlap(this.player, this.mines, (_player, mine) => {
      const target = mine as Phaser.Physics.Arcade.Sprite;
      if (!target.getData('armed')) return;
      this.destroyMine(target);
      this.damagePlayer();
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
    this.wardenActive = false;
    this.boss = undefined;
    this.bossSpawned = false;
    this.missionEnding = false;
    this.waveIndex = 0;
    this.entityId = 0;
    this.nextPrimaryAt = 0;
    this.nextMissileAt = 0;
    this.nextLaserAt = 0;
    this.nextDroneAt = 0;
    this.nextIonAt = 0;
    this.droneVolleyIndex = 0;
    this.nextCarrierIndex = 0;
    this.killsSinceUtilityDrop = 0;
    this.offerId = 0;
    this.lastThreatLevel = 1;
    this.model.start(config);
    this.encounterDirector = new EncounterDirector(config.campaignSeed, config.difficulty, config.mission.id);

    const missionTints: Record<string, number> = {
      coastal: 0xffffff,
      minefield: 0xd9f7d9,
      fortress: 0xd6d7ff,
      dreadnought: 0xffd5dc,
    };
    const environmentKeys: Record<string, string> = {
      coastal: ASSET_KEYS.coastal,
      minefield: ASSET_KEYS.minefield,
      fortress: ASSET_KEYS.fortress,
      dreadnought: ASSET_KEYS.dreadnought,
    };
    const accentColors: Record<string, number> = {
      coastal: 0x35e8ff,
      minefield: 0x45ff9c,
      fortress: 0x9d7dff,
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
    for (const group of [this.playerBullets, this.enemyBullets, this.enemies, this.pickups, this.mines]) group.clear(true, true);
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
        this.spawnPlayerBullet(this.player.x, this.player.y - 42, ASSET_KEYS.playerBullet, angle, arcDamage * prism);
      });
      if (this.model.modifiers.splitCapacitors) this.spawnPlayerBullet(this.player.x + 8, this.player.y - 40, ASSET_KEYS.playerBullet, 0, 1);
      const levelFiveRate = spreadLevel >= 5 ? 0.9 : 1;
      this.nextPrimaryAt = time + Math.max(62, (154 - spreadLevel * 12) * intervalScale * levelFiveRate);
      this.emitSound('fire');
    }

    const droneLevel = this.model.weapons.drone;
    if (droneLevel > 0 && time >= this.nextDroneAt) {
      this.drones.filter((drone) => drone.visible).forEach((drone) => {
        this.spawnPlayerBullet(drone.x, drone.y - 20, ASSET_KEYS.playerBullet, 0, 0.7);
      });
      this.droneVolleyIndex += 1;
      if (this.model.modifiers.ordnanceCascade && this.droneVolleyIndex % 4 === 0) {
        this.drones.filter((drone) => drone.visible).forEach((drone) => {
          this.spawnPlayerBullet(drone.x, drone.y - 12, ASSET_KEYS.missile, 0, 2.2);
        });
      }
      const levelRate = droneLevel >= 5 ? 0.72 : droneLevel >= 3 ? 0.82 : 1;
      this.nextDroneAt = time + 300 * intervalScale * levelRate * (this.model.modifiers.hunterLogic ? 0.8 : 1);
    }

    const missileLevel = this.model.weapons.missile;
    if (missileLevel > 0 && time >= this.nextMissileAt) {
      const count = (missileLevel >= 4 ? 3 : missileLevel >= 2 ? 2 : 1) + (this.model.modifiers.ordnanceCascade ? 1 : 0);
      for (let index = 0; index < count; index += 1) {
        const offset = (index - (count - 1) / 2) * 27;
        const hunterDamage = this.model.modifiers.hunterLogic ? 1.25 : 1;
        this.spawnPlayerBullet(this.player.x + offset, this.player.y - 18, ASSET_KEYS.missile, offset * 0.0015, (3 + missileLevel) * hunterDamage);
      }
      this.nextMissileAt = time + Math.max(360, (1_060 - missileLevel * 120) * intervalScale);
      this.emitSound('missile');
    }

    const laserLevel = this.model.weapons.laser;
    if (laserLevel > 0 && time >= this.nextLaserAt) {
      const centerBoost = this.model.modifiers.prismaticCore ? 1.35 : 1;
      this.spawnPlayerBullet(this.player.x, this.player.y - 53, ASSET_KEYS.laser, 0, (4 + laserLevel * 2) * centerBoost);
      if (laserLevel >= 3) {
        this.spawnPlayerBullet(this.player.x - 17, this.player.y - 45, ASSET_KEYS.laser, -0.025, 5 + laserLevel);
        this.spawnPlayerBullet(this.player.x + 17, this.player.y - 45, ASSET_KEYS.laser, 0.025, 5 + laserLevel);
      }
      const highLevelRate = laserLevel >= 4 ? 0.8 : 1;
      this.nextLaserAt = time + Math.max(520, (1_720 - laserLevel * 190) * intervalScale * highLevelRate);
      this.emitSound('laser');
    }

    if (this.model.weapons.ion > 0 && time >= this.nextIonAt) this.fireIon(time);
  }

  private fireIon(time: number): void {
    const level = this.model.weapons.ion;
    const available = this.enemies.getMatching('active', true)
      .map((enemy) => enemy as Phaser.Physics.Arcade.Sprite)
      .filter((enemy) => enemy.getData('combatReady') !== false);
    if (available.length === 0) return;
    const boss = available.find((enemy) => ['boss', 'warden'].includes(enemy.getData('kind') as string));
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
      this.damageEnemy(enemy, damage);
    });
    if (level >= 5 && !boss) {
      const final = hit[hit.length - 1];
      this.applyIonDischarge(final.x, final.y, final.getData('entityId') as number, damage * 0.45);
    }
    this.nextIonAt = time + Math.max(720, 1_650 - level * 150) * this.model.fireIntervalMultiplier;
    this.emitSound('laser');
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
    arc.lineStyle(7, 0x8b7dff, 0.2).strokePoints(points);
    arc.lineStyle(2, 0xf3efff, 0.96).strokePoints(points);
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
    const pulse = this.add.circle(x, y, 8, 0xb79cff, 0.16).setDepth(6).setStrokeStyle(2, 0xf3efff, 0.9);
    this.transientViews.add(pulse);
    this.tweens.add({ targets: pulse, scale: 5.2, alpha: 0, duration: 220, onComplete: () => this.destroyTransient(pulse) });
  }

  private spawnPlayerBullet(x: number, y: number, texture: string, angle: number, baseDamage: number): void {
    const bullet = this.playerBullets.get(x, y, texture) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;
    bullet.setTexture(texture).setPosition(x, y).setActive(true).setVisible(true).setDepth(4).setAlpha(1).setScale(1);
    if (texture === ASSET_KEYS.laser && this.model.modifiers.splitCapacitors) bullet.setScale(1.2, 1);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setSize(texture === ASSET_KEYS.laser && this.model.modifiers.splitCapacitors ? 11 : 8, texture === ASSET_KEYS.laser ? 48 : 22);
    const missile = texture === ASSET_KEYS.missile;
    bullet.setDataEnabled()
      .setData('damage', baseDamage * this.model.damageMultiplier)
      .setData('missile', missile)
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
    let nearest: Phaser.Physics.Arcade.Sprite | undefined;
    let distance = Number.POSITIVE_INFINITY;
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active || enemy.getData('combatReady') === false) return true;
      const candidate = Phaser.Math.Distance.Squared(missile.x, missile.y, enemy.x, enemy.y);
      if (candidate < distance) {
        distance = candidate;
        nearest = enemy;
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

  private updateDrones(delta: number): void {
    const level = this.model.weapons.drone;
    const count = level === 0 ? 0 : level === 1 ? 1 : level < 4 ? 2 : level === 4 ? 3 : 4;
    this.drones.forEach((drone, index) => {
      const visible = index < count;
      drone.setVisible(visible);
      if (!visible) return;
      const side = index === 0 ? -1 : 1;
      const targetX = this.player.x + side * (58 + level * 4);
      const targetY = this.player.y + 17 + Math.sin(this.time.now * 0.004 + index * Math.PI) * 6;
      drone.x = Phaser.Math.Linear(drone.x, targetX, Math.min(1, delta * 0.012));
      drone.y = Phaser.Math.Linear(drone.y, targetY, Math.min(1, delta * 0.012));
    });
  }

  private updateWaveDirector(time: number): void {
    if (this.model.mission.id === 'dreadnought') {
      if (!this.bossSpawned && this.model.stageElapsedMs >= 900) this.spawnBoss();
      return;
    }

    const progress = Math.min(1, this.model.stageElapsedMs / this.model.stageDurationMs);
    const threat = this.model.snapshot().threatLevel;
    if (threat !== this.lastThreatLevel) {
      this.lastThreatLevel = threat;
      this.announce(`THREAT LEVEL ${threat} // PRESSURE RISING`);
      this.emitSound('warning');
    }
    this.maybeSpawnArmamentCarrier(progress);
    this.maybeSpawnCommandTargets();
    if (this.model.stageElapsedMs >= this.model.stageDurationMs && this.commandSpawned && this.commandRemaining <= 0) {
      this.completeMission(false);
      return;
    }
    if (this.wardenActive || time < this.nextWaveAt || this.enemies.countActive(true) >= MAX_ACTIVE_ENEMIES - 4) return;
    this.spawnWave(this.waveIndex);
    this.waveIndex += 1;
    const tuning = this.encounterDirector?.tuning(progress) ?? getThreatTuning(progress, this.model.difficulty, this.model.mission.id);
    this.spawnThreatEscorts(tuning.waveBudget);
    this.nextWaveAt = time + tuning.waveIntervalMs;
  }

  private maybeSpawnArmamentCarrier(progress: number): void {
    const milestones = carrierMilestones(this.model.mission.id);
    if (this.nextCarrierIndex >= milestones.length || progress < milestones[this.nextCarrierIndex]) return;
    if (this.enemies.countActive(true) >= MAX_ACTIVE_ENEMIES - 2 || this.wardenActive) return;
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
      this.wardenActive = true;
      this.enemies.clear(true, true);
      this.enemyBullets.clear(true, true);
      this.cleanupDetachedViews();
      this.announce('WARNING // WARDEN DETECTED');
      this.emitSound('warning');
      const warden = this.spawnEnemy('warden', WORLD_WIDTH / 2, -105, 0);
      warden?.setData('commandTarget', true).setData('attackIndex', 0);
      if (warden) this.markCarrier(warden, globalCarrierIndex('minefield', 3));
      this.model.setBoss('WARDEN', 1);
    } else if (this.model.mission.id === 'fortress' && remaining <= 25_000) {
      this.commandSpawned = true;
      this.commandRemaining = 2;
      this.announce('COMMAND-ELITE GAUNTLET');
      const left = this.spawnEnemy('elite', 390, -80, 1);
      const right = this.spawnEnemy('elite', 890, -130, 2);
      left?.setData('commandTarget', true);
      if (left) this.markCarrier(left, globalCarrierIndex('fortress', 4));
      right?.setData('commandTarget', true);
      if (right) this.configureDepthArrival(right, 1_200);
      this.spawnEnemy('shieldCarrier', WORLD_WIDTH / 2, -180, 0);
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
      if (pattern === 2 || pattern === 5) {
        this.spawnEnemy('mineLayer', this.waveX(index, 4, 260, 1020), -80, index);
        for (let i = 0; i < 3; i += 1) this.spawnEnemy('scout', 260 + i * 380, -130 - i * 30, i);
      } else if (pattern === 4) {
        this.spawnEnemy('shieldCarrier', WORLD_WIDTH / 2, -85, index);
        this.spawnEnemy('bomber', 400, -145, 1);
        this.spawnEnemy('bomber', 880, -145, 2);
      } else this.spawnBaseHeavyWave(index, progress);
      return;
    }

    const specialist = SPECIALISTS[(index + Math.floor(progress * 4)) % SPECIALISTS.length];
    if (pattern === 2 || pattern === 4) {
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
    const key = ASSET_KEYS[kind];
    const enemy = this.physics.add.sprite(x, y, key).setDepth(3);
    this.enemies.add(enemy);
    const config = ENEMIES[kind];
    const progress = Math.min(1, this.model.stageElapsedMs / Math.max(1, this.model.stageDurationMs));
    const threat = getThreatTuning(progress, this.model.difficulty, this.model.mission.id);
    const health = Math.max(1, Math.round(config.health * DIFFICULTY[this.model.difficulty].enemyHealth * threat.enemyHealth));
    enemy.setDataEnabled()
      .setData('entityId', ++this.entityId)
      .setData('kind', kind)
      .setData('health', health)
      .setData('maxHealth', health)
      .setData('originX', x)
      .setData('phase', phase)
      .setData('spawnedAt', this.time.now)
      .setData('state', 'entry')
      .setData('combatReady', true)
      .setData('speedScale', threat.movementSpeed)
      .setData('fireScale', threat.fireRate)
      .setData('chronoScale', 1)
      .setData('nextFire', this.time.now + Phaser.Math.Between(900, 2_100));
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setSize(enemy.width * (kind === 'boss' || kind === 'warden' ? 0.78 : 0.58), enemy.height * 0.52);

    if (kind === 'interceptor') {
      const fromLeft = x < 0;
      enemy.setVelocity((fromLeft ? 230 : -230) * threat.movementSpeed, config.speed * 0.7 * threat.movementSpeed);
      enemy.setAngle(fromLeft ? -24 : 24);
    } else enemy.setVelocityY(config.speed * threat.movementSpeed);

    const shadow = this.add.ellipse(x + 10, y + 34, enemy.width * 0.55, enemy.height * 0.2, 0x02050b, 0.34).setDepth(1);
    enemy.setData('shadow', shadow);
    this.transientViews.add(shadow);

    if (kind === 'shieldCarrier') {
      const aura = this.add.circle(x, y, 150, 0x8b7dff, 0.05).setDepth(2).setStrokeStyle(3, 0x8b7dff, 0.58);
      enemy.setData('aura', aura);
      this.transientViews.add(aura);
    }
    if (['charger', 'mineLayer', 'shieldCarrier', 'warden', 'boss'].includes(kind)) {
      this.configureDepthArrival(enemy, kind === 'boss' ? 1_800 : kind === 'warden' ? 1_400 : 900);
    }
    return enemy;
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
      else if (kind === 'warden') this.updateWarden(enemy, time);
      else if (kind === 'charger') this.updateCharger(enemy, time);
      else if (kind === 'sniper') this.updateSniper(enemy, time);
      else if (kind === 'mineLayer') this.updateMineLayer(enemy, time);
      else if (kind === 'shieldCarrier') this.updateShieldCarrier(enemy, time);
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
    const command = kind === 'warden' || kind === 'boss';
    const targetY = kind === 'boss' ? 128 : kind === 'warden' ? 125 : 115;
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
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
    const command = kind === 'warden' || kind === 'boss';
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
    enemy.setScale(1).setAlpha(1).setY(targetY).setData('combatReady', true).setData('nextFire', this.time.now + 450);
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setSize(enemy.width * (command ? 0.78 : 0.58), enemy.height * 0.52);
    enemy.setVelocityY(ENEMIES[kind].speed * (enemy.getData('speedScale') as number));
    this.particles.setParticleTint(command ? 0xf06cff : 0x35e8ff);
    this.particles.explode(command ? 28 : 16, enemy.x, enemy.y);
  }

  private updateEnemyPresentation(enemy: Phaser.Physics.Arcade.Sprite): void {
    if (enemy.getData('combatReady') !== false) {
      const kind = enemy.getData('kind') as EnemyKind;
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      if (['scout', 'interceptor', 'bomber', 'elite'].includes(kind)) {
        const baseKey = ASSET_KEYS[kind];
        enemy.setTexture(body.velocity.x < -35 ? `${baseKey}-bank-left` : body.velocity.x > 35 ? `${baseKey}-bank-right` : baseKey);
      }
      if (!['charger', 'interceptor', 'boss', 'warden'].includes(kind)) {
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
  }

  private markCarrier(enemy: Phaser.Physics.Arcade.Sprite, carrierIndex: number): void {
    enemy.setData('carrierIndex', carrierIndex)
      .setData('health', Math.ceil((enemy.getData('health') as number) * 1.35))
      .setData('maxHealth', Math.ceil((enemy.getData('maxHealth') as number) * 1.35));
    const aura = this.add.circle(enemy.x, enemy.y, Math.max(38, enemy.width * 0.48), 0xffb640, 0.06)
      .setDepth(2)
      .setStrokeStyle(3, 0xffcf68, 0.82);
    enemy.setData('carrierAura', aura);
    this.transientViews.add(aura);
    if (enemy.getData('combatReady') !== false && !['boss', 'warden'].includes(enemy.getData('kind') as string)) {
      this.configureDepthArrival(enemy, 1_100);
    }
  }

  private updateStandardEnemy(enemy: Phaser.Physics.Arcade.Sprite, kind: EnemyKind, time: number): void {
    const aliveMs = time - (enemy.getData('spawnedAt') as number);
    const phase = enemy.getData('phase') as number;
    const originX = enemy.getData('originX') as number;
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
      enemy.x = (enemy.getData('originX') as number) + Math.sin(time * 0.0012) * 90;
      if (time >= (enemy.getData('nextFire') as number)) {
        const aim = this.add.graphics().setDepth(4);
        this.transientViews.add(aim);
        enemy.setData('state', 'aiming').setData('aimUntil', time + 1_000).setData('telegraph', aim);
        this.emitSound('warning');
      }
      return;
    }
    if (state === 'aiming') {
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      enemy.setData('aimAngle', angle);
      const aim = enemy.getData('telegraph') as Phaser.GameObjects.Graphics;
      if (aim?.active) {
        aim.clear().lineStyle(2, 0xff72ca, 0.62);
        aim.lineBetween(enemy.x, enemy.y, enemy.x + Math.cos(angle) * 1_500, enemy.y + Math.sin(angle) * 1_500);
      }
      if (time >= (enemy.getData('aimUntil') as number)) {
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
    enemy.x = WORLD_WIDTH / 2 + Math.sin((time - (enemy.getData('spawnedAt') as number)) * 0.0011) * 430;
    if (time >= (enemy.getData('nextFire') as number)) {
      this.spawnMine(enemy.x, enemy.y + 32);
      const interval = ENEMIES.mineLayer.fireMs / (DIFFICULTY[this.model.difficulty].enemyFireRate * (enemy.getData('fireScale') as number));
      enemy.setData('nextFire', time + interval);
    }
  }

  private updateShieldCarrier(enemy: Phaser.Physics.Arcade.Sprite, time: number): void {
    if (enemy.y > 125) {
      enemy.setVelocityY(18 * (enemy.getData('speedScale') as number));
      enemy.x = (enemy.getData('originX') as number) + Math.sin(time * 0.0014) * 180;
    }
    const aura = enemy.getData('aura') as Phaser.GameObjects.Arc;
    if (aura?.active) aura.setPosition(enemy.x, enemy.y);
    if (enemy.y > 45 && time >= (enemy.getData('nextFire') as number)) {
      this.enemyFire(enemy, 'shieldCarrier');
      enemy.setData('nextFire', time + ENEMIES.shieldCarrier.fireMs / (DIFFICULTY[this.model.difficulty].enemyFireRate * (enemy.getData('fireScale') as number)));
    }
  }

  private updateWarden(warden: Phaser.Physics.Arcade.Sprite, time: number): void {
    if (warden.y < 125) {
      warden.setVelocityY(50);
      return;
    }
    warden.setVelocityY(0);
    const aliveMs = time - (warden.getData('spawnedAt') as number);
    warden.x = WORLD_WIDTH / 2 + Math.sin(aliveMs * 0.0009) * 280;
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
    this.enemies.clear(true, true);
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
    const aliveMs = time - (boss.getData('spawnedAt') as number);
    boss.x = WORLD_WIDTH / 2 + Math.sin(aliveMs * 0.00075) * 320;
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

  private hitEnemy(bullet: Phaser.Physics.Arcade.Sprite, enemy: Phaser.Physics.Arcade.Sprite): void {
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
    this.damageEnemy(enemy, damage);
    const missileLevel = this.model.weapons.missile;
    const splashRadius = this.model.modifiers.phaseArsenal ? 90 : missileLevel >= 5 ? 55 : 0;
    if (missile && splashRadius > 0) this.applyMissileSplash(impactX, impactY, targetId, damage * 0.55, splashRadius);
  }

  private applyMissileSplash(x: number, y: number, excludedId: number, damage: number, radius: number): void {
    const targets: Phaser.Physics.Arcade.Sprite[] = [];
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (enemy.active && enemy.getData('combatReady') !== false && enemy.getData('entityId') !== excludedId && Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= radius) targets.push(enemy);
      return true;
    });
    targets.forEach((enemy) => this.damageEnemy(enemy, damage));
    const blast = this.add.circle(x, y, 16, 0xffb640, 0.18).setDepth(5).setStrokeStyle(2, 0xffe7a0, 0.8);
    this.transientViews.add(blast);
    this.tweens.add({ targets: blast, scale: radius / 16, alpha: 0, duration: 240, onComplete: () => this.destroyTransient(blast) });
  }

  private damageEnemy(enemy: Phaser.Physics.Arcade.Sprite, rawDamage: number): void {
    if (!enemy.active || enemy.getData('combatReady') === false) return;
    const kind = enemy.getData('kind') as EnemyKind;
    const protectedByCarrier = kind !== 'shieldCarrier' && kind !== 'boss' && kind !== 'warden' && this.isProtectedByCarrier(enemy);
    const damage = rawDamage * (protectedByCarrier ? 0.3 : 1);
    const health = (enemy.getData('health') as number) - damage;
    enemy.setData('health', health);
    enemy.setTintFill(protectedByCarrier ? 0x8b7dff : 0xffffff);
    this.time.delayedCall(45, () => enemy.active && enemy.clearTint());
    this.particles.setParticleTint(protectedByCarrier ? 0x8b7dff : kind === 'elite' || kind === 'warden' ? 0xf06cff : 0xff6f61);
    this.particles.explode(3, enemy.x, enemy.y);
    if (health <= 0) this.destroyEnemy(enemy);
  }

  private isProtectedByCarrier(target: Phaser.Physics.Arcade.Sprite): boolean {
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
    const x = enemy.x;
    const y = enemy.y;
    const maxHealth = enemy.getData('maxHealth') as number;
    this.destroyEnemyView(enemy, 'telegraph');
    this.destroyEnemyView(enemy, 'aura');
    this.destroyEnemyView(enemy, 'shadow');
    this.destroyEnemyView(enemy, 'arrivalRing');
    this.destroyEnemyView(enemy, 'carrierAura');
    enemy.destroy();
    this.particles.setParticleTint(kind === 'boss' ? 0xffb640 : kind === 'warden' ? 0xf06cff : 0xff6f61);
    this.particles.explode(kind === 'boss' ? 90 : kind === 'warden' ? 58 : Math.min(28, 8 + maxHealth), x, y);
    this.emitSound('explode');

    const reward = this.model.registerKill(ENEMIES[kind].score, ENEMIES[kind].credits);
    if (reward.credits > 0) this.creditPopup(x, y, reward.credits);
    if (reward.overdriveTriggered) this.announce('OVERDRIVE REACTOR // CHAIN HOT');
    if (reward.fabricatedPickup) this.spawnPickup(x, y, reward.fabricatedPickup);
    if (carrierIndex !== undefined) this.spawnArmamentOffer(x, y, carrierIndex);

    if (commandTarget) this.commandRemaining = Math.max(0, this.commandRemaining - 1);
    if (kind === 'warden') {
      this.wardenActive = false;
      this.model.setBoss('', 0);
      this.announce('WARDEN DESTROYED // ROUTE OPEN');
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
    const type = forcedType ?? chooseUtilityPickup(this.model.hull, this.model.hullMax, this.model.empCharges, this.model.empMax);
    const pickup = this.physics.add.sprite(x, y, `${ASSET_KEYS.pickupPrefix}${type}`).setDepth(5);
    this.pickups.add(pickup);
    pickup.setDataEnabled().setData('pickup', type).setVelocityY(92);
    (pickup.body as Phaser.Physics.Arcade.Body).setCircle(22, 8, 8);
    this.tweens.add({ targets: pickup, scale: { from: 0.88, to: 1.06 }, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private spawnArmamentOffer(x: number, y: number, carrierIndex: number): void {
    const offer = chooseArmamentOffer(this.model.weapons, this.model.shieldBaseMax, this.model.campaignSeed, carrierIndex);
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
      if (tractorRadius > 0 && distance <= tractorRadius) this.physics.moveToObject(pickup, this.player, 380);
      else if (pickup.getData('pairId') === undefined) pickup.setVelocity(0, 92);
      if (pickup.y > WORLD_HEIGHT + 60) pickup.destroy();
      return true;
    });
  }

  private collectPickup(type: PickupType): void {
    if (this.model.mode !== 'playing') return;
    if (isUtilityPickup(type)) {
      const result = this.model.collectUtility(type);
      const labels: Record<UtilityPickupType, string> = {
        repair: result.applied ? 'REPAIR NANITES // HULL RESTORED' : 'HULL FULL // +500',
        overdrive: 'OVERDRIVE // WEAPONS HOT',
        tractor: 'TRACTOR FIELD // ONLINE',
        emp: result.applied ? 'EMP CELL // CHARGE ACQUIRED' : result.scoreAwarded ? 'EMP CAPACITY // +500' : 'EMP CAPACITY FULL',
      };
      this.announce(labels[type]);
      this.particles.setParticleTint(type === 'repair' ? 0xff667c : type === 'overdrive' ? 0xffb640 : type === 'tractor' ? 0x65ffb1 : 0x8b7dff);
    } else {
      const result = this.model.upgrade(type as UpgradeType);
      const label = type === 'shield' ? 'AEGIS CAPACITY' : WEAPON_LABELS[type as WeaponType].name.toUpperCase();
      this.announce(result.upgraded ? `${label} // LEVEL ${result.level}` : `${label} MAX // BONUS`);
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
      const base = kind === 'boss' || kind === 'warden' ? 35 : 12;
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
    this.cameras.main.shake(250, 0.006);
    this.announce('EMP DISCHARGE');
    this.emitSound('emp');
    this.emitState(true);
  }

  private damagePlayer(forced = false): void {
    if (this.debugMode && !forced) return;
    const result = this.model.takeDamage();
    if (result === 'ignored') return;
    if (result === 'shield' || result === 'reserve') {
      this.shieldPulse(0x35e8ff, 1);
      this.emitSound('shield-hit');
      if (this.model.modifiers.repulsorShield) this.clearEnemyBullets(this.player.x, this.player.y, 130);
      if (result === 'reserve') this.announce('AEGIS RESERVE // SHIELD RESTORED');
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
    this.player.setVelocity(0);
    this.physics.world.pause();
    BattleScene.saveHighScore(this.model.highScore);
    this.cameras.main.shake(finalVictory ? 900 : 300, finalVictory ? 0.018 : 0.005);
    this.emitSound('victory');
    this.announce(finalVictory ? 'PELAGOS ARRAY SECURED' : 'MISSION VECTOR COMPLETE');
    this.emitState(true);
    this.time.delayedCall(1_050, () => event('aegis:mission-ended', this.model.snapshot()));
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
    this.wardenActive = true;
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
  }

  private announce(message: string): void {
    event('aegis:announce', message);
  }

  private emitSound(cue: SoundCue): void {
    event('aegis:sound', cue);
  }

  private removeEscapedEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    this.destroyEnemyView(enemy, 'telegraph');
    this.destroyEnemyView(enemy, 'aura');
    this.destroyEnemyView(enemy, 'shadow');
    this.destroyEnemyView(enemy, 'arrivalRing');
    this.destroyEnemyView(enemy, 'carrierAura');
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
