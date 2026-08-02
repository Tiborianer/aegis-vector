import Phaser from 'phaser';
import { ASSET_KEYS } from '../../game/assets/manifest';
import {
  DIFFICULTY,
  ENEMIES,
  PICKUP_SEQUENCE,
  STAGE_DURATION_MS,
  WEAPON_LABELS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../../game/content/balance';
import { GameModel } from '../../game/simulation/GameModel';
import type { Difficulty, EnemyKind, GameSnapshot, UpgradeType, WeaponType } from '../../game/simulation/types';
import type { SoundCue } from '../../audio/SoundEngine';

interface DebugBridge {
  getState: () => GameSnapshot;
  start: (difficulty?: Difficulty) => void;
  damagePlayer: () => void;
  grantUpgrade: (type: UpgradeType) => void;
  spawnBoss: () => void;
}

declare global {
  interface Window {
    __AEGIS_DEBUG__?: DebugBridge;
  }
}

const event = <T>(name: string, detail?: T): void => {
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

export class BattleScene extends Phaser.Scene {
  private model = new GameModel(BattleScene.loadHighScore());
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private ocean!: Phaser.GameObjects.TileSprite;
  private clouds!: Phaser.GameObjects.TileSprite;
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'Z' | 'SPACE', Phaser.Input.Keyboard.Key>;
  private drones: Phaser.GameObjects.Sprite[] = [];
  private nextWaveAt = 0;
  private nextPrimaryAt = 0;
  private nextMissileAt = 0;
  private nextLaserAt = 0;
  private waveIndex = 0;
  private pickupIndex = 0;
  private lastHudAt = 0;
  private boss?: Phaser.Physics.Arcade.Sprite;
  private bossSpawned = false;
  private debugMode = false;

  private readonly startHandler = (raw: Event): void => {
    const difficulty = (raw as CustomEvent<Difficulty>).detail ?? 'pilot';
    this.startRun(difficulty);
  };

  private readonly pauseHandler = (): void => this.setPaused(true);
  private readonly resumeHandler = (): void => this.setPaused(false);

  constructor() {
    super('battle');
  }

  create(): void {
    this.debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
    this.createEnvironment();
    this.createPhysicsGroups();
    this.createPlayer();
    this.createInput();
    this.createCollisions();

    window.addEventListener('aegis:start', this.startHandler);
    window.addEventListener('aegis:pause', this.pauseHandler);
    window.addEventListener('aegis:resume', this.resumeHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('aegis:start', this.startHandler);
      window.removeEventListener('aegis:pause', this.pauseHandler);
      window.removeEventListener('aegis:resume', this.resumeHandler);
    });

    window.__AEGIS_DEBUG__ = {
      getState: () => this.model.snapshot(),
      start: (difficulty = 'pilot') => this.startRun(difficulty),
      damagePlayer: () => this.damagePlayer(),
      grantUpgrade: (type) => this.collectUpgrade(type),
      spawnBoss: () => this.spawnBoss(),
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
    this.updateEnemies(time);
    this.updatePickups(delta);
    this.updateWaveDirector(time);
    this.emitState(time - this.lastHudAt > 70);
  }

  private createEnvironment(): void {
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x050b19).setDepth(-20);
    this.ocean = this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, ASSET_KEYS.ocean).setDepth(-18);
    this.clouds = this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, ASSET_KEYS.cloud).setDepth(-16).setAlpha(0.52);

    const horizon = this.add.graphics().setDepth(-15);
    horizon.lineStyle(2, 0x35e8ff, 0.1).lineBetween(0, 172, WORLD_WIDTH, 172);
    horizon.fillStyle(0x35e8ff, 0.12);
    for (let x = 20; x < WORLD_WIDTH; x += 73) {
      horizon.fillCircle(x, 170 + (x % 3) * 5, x % 5 === 0 ? 3 : 2);
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
    this.ocean.tilePositionY -= delta * 0.085;
    this.ocean.tilePositionX += delta * 0.006;
    this.clouds.tilePositionY -= delta * 0.022;
  }

  private createPhysicsGroups(): void {
    this.playerBullets = this.physics.add.group({ maxSize: 180, runChildUpdate: false });
    this.enemyBullets = this.physics.add.group({ maxSize: 240, runChildUpdate: false });
    this.enemies = this.physics.add.group({ runChildUpdate: false });
    this.pickups = this.physics.add.group({ runChildUpdate: false });
  }

  private createPlayer(): void {
    this.player = this.physics.add.sprite(WORLD_WIDTH / 2, WORLD_HEIGHT - 110, ASSET_KEYS.player)
      .setDepth(6)
      .setVisible(false)
      .setActive(false);
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(28, 42).setOffset(30, 31);

    for (let index = 0; index < 2; index += 1) {
      this.drones.push(this.add.sprite(this.player.x, this.player.y, ASSET_KEYS.drone).setDepth(5).setVisible(false));
    }
  }

  private createInput(): void {
    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable.');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,Z,SPACE') as typeof this.keys;
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
      if (this.model.mode === 'playing') this.setPaused(true);
      else if (this.model.mode === 'paused') this.setPaused(false);
    });
    if (this.debugMode) {
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE).on('down', () => this.collectUpgrade('spread'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO).on('down', () => this.collectUpgrade('missile'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE).on('down', () => this.collectUpgrade('laser'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR).on('down', () => this.collectUpgrade('drone'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE).on('down', () => this.collectUpgrade('shield'));
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B).on('down', () => this.spawnBoss());
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H).on('down', () => this.damagePlayer());
    }
  }

  private createCollisions(): void {
    this.physics.add.overlap(this.playerBullets, this.enemies, (bullet, enemy) => {
      this.hitEnemy(bullet as Phaser.Physics.Arcade.Sprite, enemy as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.player, this.enemyBullets, (_player, bullet) => {
      this.disableBody(bullet as Phaser.Physics.Arcade.Sprite);
      this.damagePlayer();
    });
    this.physics.add.overlap(this.player, this.enemies, (_player, enemy) => {
      const target = enemy as Phaser.Physics.Arcade.Sprite;
      this.damagePlayer();
      if (target.getData('kind') !== 'boss') this.damageEnemy(target, 8);
    });
    this.physics.add.overlap(this.player, this.pickups, (_player, pickup) => {
      const target = pickup as Phaser.Physics.Arcade.Sprite;
      const type = target.getData('upgrade') as UpgradeType;
      this.disableBody(target);
      this.collectUpgrade(type);
    });
  }

  private startRun(difficulty: Difficulty): void {
    this.physics.world.resume();
    this.clearGroups();
    this.boss = undefined;
    this.bossSpawned = false;
    this.waveIndex = 0;
    this.pickupIndex = 0;
    this.nextPrimaryAt = 0;
    this.nextMissileAt = 0;
    this.nextLaserAt = 0;

    const duration = this.debugMode ? 28_000 : STAGE_DURATION_MS;
    this.model.start(difficulty, duration);
    this.player.setPosition(WORLD_WIDTH / 2, WORLD_HEIGHT - 110).setVisible(true).setActive(true).setAlpha(1);
    (this.player.body as Phaser.Physics.Arcade.Body).enable = true;
    this.nextWaveAt = this.time.now + 1_200;
    this.cameras.main.fadeIn(500, 2, 8, 18);
    this.announce('SECTOR 01 // PELAGOS ARRAY');
    this.emitState(true);
  }

  private clearGroups(): void {
    for (const group of [this.playerBullets, this.enemyBullets, this.enemies, this.pickups]) {
      group.clear(true, true);
    }
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

    const targetAngle = direction.x * 7;
    this.player.angle = Phaser.Math.Linear(this.player.angle, targetAngle, Math.min(1, delta * 0.014));

    if (this.keys.SPACE.isDown || this.keys.Z.isDown) this.fireWeapons(time);
  }

  private fireWeapons(time: number): void {
    const spreadLevel = this.model.weapons.spread;
    if (time >= this.nextPrimaryAt) {
      const angles = spreadLevel === 1 ? [0] : spreadLevel === 2 ? [-0.09, 0, 0.09] : [-0.17, -0.08, 0, 0.08, 0.17];
      angles.forEach((angle) => this.spawnPlayerBullet(this.player.x, this.player.y - 42, ASSET_KEYS.playerBullet, angle, 1));
      this.drones.filter((drone) => drone.visible).forEach((drone) => this.spawnPlayerBullet(drone.x, drone.y - 20, ASSET_KEYS.playerBullet, 0, 0.7));
      this.nextPrimaryAt = time + Math.max(92, 142 - spreadLevel * 12);
      this.emitSound('fire');
    }

    const missileLevel = this.model.weapons.missile;
    if (missileLevel > 0 && time >= this.nextMissileAt) {
      const count = missileLevel >= 2 ? 2 : 1;
      for (let index = 0; index < count; index += 1) {
        const offset = count === 1 ? 0 : (index === 0 ? -27 : 27);
        this.spawnPlayerBullet(this.player.x + offset, this.player.y - 18, ASSET_KEYS.missile, offset * 0.0015, 3 + missileLevel);
      }
      this.nextMissileAt = time + (980 - missileLevel * 130);
      this.emitSound('missile');
    }

    const laserLevel = this.model.weapons.laser;
    if (laserLevel > 0 && time >= this.nextLaserAt) {
      this.spawnPlayerBullet(this.player.x, this.player.y - 53, ASSET_KEYS.laser, 0, 4 + laserLevel * 2);
      if (laserLevel === 3) {
        this.spawnPlayerBullet(this.player.x - 17, this.player.y - 45, ASSET_KEYS.laser, -0.025, 5);
        this.spawnPlayerBullet(this.player.x + 17, this.player.y - 45, ASSET_KEYS.laser, 0.025, 5);
      }
      this.nextLaserAt = time + (1_650 - laserLevel * 210);
      this.emitSound('laser');
    }
  }

  private spawnPlayerBullet(x: number, y: number, texture: string, angle: number, damage: number): void {
    const bullet = this.playerBullets.get(x, y, texture) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;
    bullet.setTexture(texture).setPosition(x, y).setActive(true).setVisible(true).setDepth(4).setAlpha(1);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setSize(8, texture === ASSET_KEYS.laser ? 48 : 22);
    bullet.setDataEnabled().setData('damage', damage).setData('missile', texture === ASSET_KEYS.missile);
    const speed = texture === ASSET_KEYS.missile ? 620 : 940;
    bullet.setVelocity(Math.sin(angle) * speed, -Math.cos(angle) * speed);
    bullet.setRotation(angle);
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
      if (bullet.active && (bullet.y > WORLD_HEIGHT + 50 || bullet.y < -50 || bullet.x < -50 || bullet.x > WORLD_WIDTH + 50)) this.disableBody(bullet);
      return true;
    });
  }

  private homeMissile(missile: Phaser.Physics.Arcade.Sprite, delta: number): void {
    let nearest: Phaser.Physics.Arcade.Sprite | undefined;
    let distance = Number.POSITIVE_INFINITY;
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return true;
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
    const next = Phaser.Math.Angle.RotateTo(current, desired, delta * 0.004);
    this.physics.velocityFromRotation(next, 620, body.velocity);
    missile.rotation = next + Math.PI / 2;
  }

  private updateDrones(delta: number): void {
    const level = this.model.weapons.drone;
    const count = level === 0 ? 0 : level === 1 ? 1 : 2;
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
    if (!this.bossSpawned && this.model.stageElapsedMs >= this.model.stageDurationMs) {
      this.spawnBoss();
      return;
    }

    if (this.bossSpawned || time < this.nextWaveAt) return;
    this.spawnWave(this.waveIndex);
    this.waveIndex += 1;
    const progress = this.model.stageElapsedMs / this.model.stageDurationMs;
    this.nextWaveAt = time + Phaser.Math.Linear(5_500, 2_650, Math.min(1, progress));
  }

  private spawnWave(index: number): void {
    const pattern = index % 6;
    const progress = this.model.stageElapsedMs / this.model.stageDurationMs;
    if (pattern === 0 || pattern === 3) {
      const center = Phaser.Math.Between(300, 980);
      for (let i = -2; i <= 2; i += 1) this.spawnEnemy('scout', center + i * 78, -40 - Math.abs(i) * 34, i);
    } else if (pattern === 1) {
      for (let i = 0; i < 4; i += 1) this.spawnEnemy('interceptor', i % 2 === 0 ? -30 : WORLD_WIDTH + 30, 65 + i * 78, i);
    } else if (pattern === 2) {
      this.spawnEnemy('bomber', Phaser.Math.Between(250, 1030), -60, index);
      for (let i = 0; i < 3; i += 1) this.spawnEnemy('scout', 270 + i * 370, -130 - i * 28, i);
    } else if (pattern === 4 && progress > 0.28) {
      this.spawnEnemy('elite', Phaser.Math.Between(320, 960), -70, index);
      this.announce(progress < 0.62 ? 'ELITE SIGNAL DETECTED' : 'HEAVY WAVE INBOUND');
    } else {
      for (let i = 0; i < 6; i += 1) this.spawnEnemy(i % 3 === 0 ? 'interceptor' : 'scout', 120 + i * 205, -40 - (i % 2) * 75, i);
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, phase: number): Phaser.Physics.Arcade.Sprite {
    const key = kind === 'boss' ? ASSET_KEYS.boss : ASSET_KEYS[kind];
    const enemy = this.physics.add.sprite(x, y, key).setDepth(3);
    this.enemies.add(enemy);
    const config = ENEMIES[kind];
    const health = Math.max(1, Math.round(config.health * DIFFICULTY[this.model.difficulty].enemyHealth));
    enemy.setDataEnabled()
      .setData('kind', kind)
      .setData('health', health)
      .setData('maxHealth', health)
      .setData('originX', x)
      .setData('phase', phase)
      .setData('spawnedAt', this.time.now)
      .setData('nextFire', this.time.now + Phaser.Math.Between(900, 2_100));
    enemy.body.setSize(enemy.width * (kind === 'boss' ? 0.78 : 0.58), enemy.height * 0.52);

    if (kind === 'interceptor') {
      const fromLeft = x < 0;
      enemy.setVelocity(fromLeft ? 230 : -230, config.speed * 0.7);
      enemy.setAngle(fromLeft ? -24 : 24);
    } else {
      enemy.setVelocityY(config.speed);
    }
    return enemy;
  }

  private updateEnemies(time: number): void {
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return true;
      const kind = enemy.getData('kind') as EnemyKind;
      if (kind === 'boss') {
        this.updateBoss(enemy, time);
        return true;
      }

      const aliveMs = time - (enemy.getData('spawnedAt') as number);
      const phase = enemy.getData('phase') as number;
      const originX = enemy.getData('originX') as number;
      if (kind === 'scout') enemy.x = originX + Math.sin(aliveMs * 0.0024 + phase) * 54;
      if (kind === 'bomber' && enemy.y > 135) {
        enemy.setVelocityY(36);
        enemy.x = originX + Math.sin(aliveMs * 0.0012) * 135;
      }
      if (kind === 'elite' && enemy.y > 125) {
        enemy.setVelocityY(22);
        enemy.x = originX + Math.sin(aliveMs * 0.0017) * 230;
      }

      if (enemy.y > WORLD_HEIGHT + 90 || enemy.x < -140 || enemy.x > WORLD_WIDTH + 140) {
        enemy.destroy();
        return true;
      }

      if (enemy.y > 45 && enemy.y < 470 && time >= (enemy.getData('nextFire') as number)) {
        this.enemyFire(enemy, kind);
        const base = ENEMIES[kind].fireMs / DIFFICULTY[this.model.difficulty].enemyFireRate;
        enemy.setData('nextFire', time + base * Phaser.Math.FloatBetween(0.82, 1.24));
      }
      return true;
    });
  }

  private enemyFire(enemy: Phaser.Physics.Arcade.Sprite, kind: EnemyKind): void {
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    if (kind === 'bomber') {
      [-0.22, 0, 0.22].forEach((offset) => this.spawnEnemyBullet(enemy.x, enemy.y + 25, angle + offset, false));
    } else if (kind === 'elite') {
      [-0.3, -0.15, 0, 0.15, 0.3].forEach((offset) => this.spawnEnemyBullet(enemy.x, enemy.y + 28, angle + offset, true));
    } else {
      this.spawnEnemyBullet(enemy.x, enemy.y + 18, angle, false);
    }
    this.emitSound('enemy-fire');
  }

  private spawnEnemyBullet(x: number, y: number, angle: number, heavy: boolean): void {
    const key = heavy ? ASSET_KEYS.enemyBulletHeavy : ASSET_KEYS.enemyBullet;
    const bullet = this.enemyBullets.get(x, y, key) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;
    bullet.setTexture(key).setPosition(x, y).setActive(true).setVisible(true).setDepth(4);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setCircle(heavy ? 8 : 5, heavy ? 8 : 6, heavy ? 8 : 6);
    const speed = (heavy ? 245 : 300) * DIFFICULTY[this.model.difficulty].enemyBulletSpeed;
    this.physics.velocityFromRotation(angle, speed, body.velocity);
  }

  private spawnBoss(): void {
    if (this.bossSpawned || this.model.mode !== 'playing') return;
    this.bossSpawned = true;
    this.enemies.clear(true, true);
    this.enemyBullets.clear(true, true);
    this.model.restoreShield();
    this.shieldPulse(0x35e8ff, 1.25);
    this.announce('WARNING // DREADNOUGHT');
    this.emitSound('warning');
    this.cameras.main.shake(550, 0.006);
    this.boss = this.spawnEnemy('boss', WORLD_WIDTH / 2, -100, 0);
    this.boss.setData('attackIndex', 0);
    this.model.setBoss(1);
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
    this.model.setBoss(healthRatio);

    if (time < (boss.getData('nextFire') as number)) return;
    const attackIndex = boss.getData('attackIndex') as number;
    const speedUp = healthRatio < 0.5 ? 0.74 : 1;
    if (attackIndex % 3 === 0) {
      const aim = Phaser.Math.Angle.Between(boss.x, boss.y, this.player.x, this.player.y);
      for (let i = -3; i <= 3; i += 1) this.spawnEnemyBullet(boss.x, boss.y + 40, aim + i * 0.12, i % 2 === 0);
    } else {
      const count = healthRatio < 0.5 ? 18 : 13;
      for (let i = 0; i < count; i += 1) {
        this.spawnEnemyBullet(boss.x, boss.y + 25, (Math.PI * 2 * i) / count + aliveMs * 0.0002, i % 4 === 0);
      }
    }
    boss.setData('attackIndex', attackIndex + 1);
    boss.setData('nextFire', time + ENEMIES.boss.fireMs * speedUp / DIFFICULTY[this.model.difficulty].enemyFireRate);
    this.emitSound('enemy-fire');
  }

  private hitEnemy(bullet: Phaser.Physics.Arcade.Sprite, enemy: Phaser.Physics.Arcade.Sprite): void {
    if (!bullet.active || !enemy.active) return;
    const damage = bullet.getData('damage') as number;
    this.disableBody(bullet);
    this.damageEnemy(enemy, damage);
  }

  private damageEnemy(enemy: Phaser.Physics.Arcade.Sprite, damage: number): void {
    if (!enemy.active) return;
    const health = (enemy.getData('health') as number) - damage;
    enemy.setData('health', health);
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(45, () => enemy.active && enemy.clearTint());
    this.particles.setParticleTint(enemy.getData('kind') === 'elite' ? 0xf06cff : 0xff6f61);
    this.particles.explode(3, enemy.x, enemy.y);
    if (health <= 0) this.destroyEnemy(enemy);
  }

  private destroyEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    const kind = enemy.getData('kind') as EnemyKind;
    const x = enemy.x;
    const y = enemy.y;
    const maxHealth = enemy.getData('maxHealth') as number;
    enemy.destroy();
    this.particles.setParticleTint(kind === 'boss' ? 0xffb640 : 0xff6f61);
    this.particles.explode(kind === 'boss' ? 90 : Math.min(28, 8 + maxHealth), x, y);
    this.emitSound('explode');

    const points = this.model.registerKill(ENEMIES[kind].score);
    if (kind === 'boss') {
      this.boss = undefined;
      this.model.win();
      this.physics.world.pause();
      BattleScene.saveHighScore(this.model.highScore);
      this.cameras.main.shake(900, 0.018);
      this.emitSound('victory');
      this.announce('SECTOR SECURED');
      this.time.delayedCall(1_250, () => event('aegis:ended', this.model.snapshot()));
      this.emitState(true);
      return;
    }

    if (kind === 'elite' || this.model.kills % 5 === 0 || Math.random() < DIFFICULTY[this.model.difficulty].dropChance * 0.35) {
      this.spawnPickup(x, y);
    }
    if (points >= 2_000) this.announce(`CHAIN ×${this.model.multiplier}`);
  }

  private spawnPickup(x: number, y: number): void {
    const type = PICKUP_SEQUENCE[this.pickupIndex % PICKUP_SEQUENCE.length];
    this.pickupIndex += 1;
    const pickup = this.physics.add.sprite(x, y, `${ASSET_KEYS.pickupPrefix}${type}`).setDepth(5);
    this.pickups.add(pickup);
    pickup.setDataEnabled().setData('upgrade', type).setVelocityY(92);
    pickup.body.setCircle(22, 8, 8);
    this.tweens.add({ targets: pickup, scale: { from: 0.88, to: 1.06 }, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private updatePickups(delta: number): void {
    this.pickups.children.each((child) => {
      const pickup = child as Phaser.Physics.Arcade.Sprite;
      if (!pickup.active) return true;
      pickup.rotation += delta * 0.0007;
      if (pickup.y > WORLD_HEIGHT + 60) pickup.destroy();
      return true;
    });
  }

  private collectUpgrade(type: UpgradeType): void {
    if (this.model.mode !== 'playing') return;
    const result = this.model.upgrade(type);
    const label = type === 'shield' ? 'AEGIS CAPACITY' : WEAPON_LABELS[type as WeaponType].name.toUpperCase();
    this.announce(result.upgraded ? `${label} // LEVEL ${result.level}` : `${label} MAX // BONUS`);
    this.emitSound('pickup');
    this.particles.setParticleTint(type === 'shield' ? 0x63a8ff : WEAPON_LABELS[type as WeaponType].color);
    this.particles.explode(28, this.player.x, this.player.y);
    this.emitState(true);
  }

  private damagePlayer(): void {
    const result = this.model.takeDamage();
    if (result === 'ignored') return;
    if (result === 'shield') {
      this.shieldPulse(0x35e8ff, 1);
      this.emitSound('shield-hit');
    } else {
      this.cameras.main.shake(result === 'destroyed' ? 650 : 260, result === 'destroyed' ? 0.02 : 0.009);
      this.particles.setParticleTint(0xff667c);
      this.particles.explode(result === 'destroyed' ? 75 : 25, this.player.x, this.player.y);
      this.emitSound('hull-hit');
    }

    this.tweens.killTweensOf(this.player);
    this.tweens.add({ targets: this.player, alpha: { from: 0.22, to: 1 }, duration: 100, repeat: result === 'shield' ? 2 : 6 });
    if (result === 'destroyed') this.endRun();
    this.emitState(true);
  }

  private shieldPulse(color: number, scale: number): void {
    const ring = this.add.circle(this.player.x, this.player.y, 32, color, 0.05).setDepth(7).setStrokeStyle(3, color, 0.9);
    this.tweens.add({
      targets: ring,
      scale: 2.1 * scale,
      alpha: 0,
      duration: 430,
      ease: 'Quad.out',
      onComplete: () => ring.destroy(),
    });
  }

  private endRun(): void {
    this.player.setVelocity(0).setVisible(false).setActive(false);
    BattleScene.saveHighScore(this.model.highScore);
    this.physics.world.pause();
    this.announce('AEGIS SIGNAL LOST');
    this.time.delayedCall(850, () => event('aegis:ended', this.model.snapshot()));
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
      // Private browsing can deny storage; the run remains fully playable.
    }
  }
}
